import "server-only";
import { RoutingError, type SnapResult } from "@/lib/routing/provider";
import type { Mode, Position } from "@/lib/types";

const BASE = "https://router.project-osrm.org";

const PROFILE_BY_MODE: Record<Mode, string> = {
  driving: "driving",
  walking: "walking",
  cycling: "cycling",
};

interface OsrmNearestResponse {
  code: string;
  waypoints?: Array<{ location?: [number, number]; distance?: number }>;
}

export async function osrmSnap(mode: Mode, point: Position): Promise<SnapResult> {
  const profile = PROFILE_BY_MODE[mode];
  const res = await fetch(
    `${BASE}/nearest/v1/${profile}/${point[0]},${point[1]}?number=1`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new RoutingError(`吸附服务返回 ${res.status}`, "upstream");
  }
  const data = (await res.json()) as OsrmNearestResponse;
  const w = data.waypoints?.[0];
  if (!w?.location) {
    return { location: point, snappedDistanceM: Infinity };
  }
  return {
    location: w.location,
    snappedDistanceM: w.distance ?? 0,
  };
}