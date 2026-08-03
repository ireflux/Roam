import { NextResponse } from "next/server";
import { getRoutingProvider, hasOrsKey } from "@/lib/routing/provider-factory";
import { osrmSnap } from "@/lib/routing/osrm";
import { RoutingError } from "@/lib/routing/provider";
import type { Mode, Position } from "@/lib/types";

function parsePosition(v: unknown): Position | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [lng, lat] = v as unknown[];
  if (typeof lng !== "number" || typeof lat !== "number" || !isFinite(lng) || !isFinite(lat))
    return null;
  return [lng, lat];
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { mode?: Mode; point?: unknown };
  const mode = body.mode;
  if (mode !== "driving" && mode !== "walking" && mode !== "cycling") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const point = parsePosition(body.point);
  if (!point) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    let result;
    if (hasOrsKey()) {
      result = await getRoutingProvider().snap(mode, point);
    } else {
      result = await osrmSnap(mode, point);
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof RoutingError) {
      return NextResponse.json(
        { error: e.code, message: e.message, location: point, snappedDistanceM: 0 },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "upstream", location: point }, { status: 502 });
  }
}
