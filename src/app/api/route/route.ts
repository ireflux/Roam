import { NextResponse } from "next/server";
import { getCachedRoute, setCachedRoute } from "@/lib/routing/cache";
import { getRoutingProvider } from "@/lib/routing/provider-factory";
import { RoutingError } from "@/lib/routing/provider";
import type { Mode, Position } from "@/lib/types";
import { roughDistanceM } from "@/lib/trip/geo";

function parsePosition(v: unknown): Position | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [lng, lat] = v as unknown[];
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  if (!isFinite(lng) || !isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    mode?: Mode;
    from?: unknown;
    to?: unknown;
  };
  const mode = body.mode;
  if (mode !== "driving" && mode !== "walking" && mode !== "cycling") {
    return NextResponse.json({ error: "bad_request", message: "mode 无效" }, { status: 400 });
  }
  const from = parsePosition(body.from);
  const to = parsePosition(body.to);
  if (!from || !to) {
    return NextResponse.json({ error: "bad_request", message: "from/to 无效" }, { status: 400 });
  }

  const cached = getCachedRoute(mode, from, to);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  let result;
  try {
    const provider = getRoutingProvider();
    result = await provider.route(mode, from, to);
  } catch (e) {
    if (e instanceof RoutingError) {
      return NextResponse.json(
        { error: e.code, message: e.message, fallback: fallbackLine(from, to) },
        { status: e.code === "no_route" ? 422 : 502 },
      );
    }
    return NextResponse.json(
      { error: "upstream", message: "路线服务异常", fallback: fallbackLine(from, to) },
      { status: 502 },
    );
  }

  setCachedRoute(mode, from, to, result);
  return NextResponse.json(result);
}

function fallbackLine(from: Position, to: Position) {
  const distanceM = roughDistanceM(from, to);
  const durationMin = Math.max(1, Math.round(distanceM / 5000));
  return {
    geometry: [from, to],
    distanceM,
    durationMin,
    fallback: true,
  };
}
