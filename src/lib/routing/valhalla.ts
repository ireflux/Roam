import "server-only";
import {
  RoutingError,
  type RoutingProvider,
  type RouteResult,
} from "@/lib/routing/provider";
import type { Mode, Position } from "@/lib/types";
import { roughDistanceM } from "@/lib/trip/geo";
import { decodePolyline6 } from "@/lib/routing/polyline";

const BASE = "https://valhalla1.openstreetmap.de/route";

const COSTING_BY_MODE: Record<Mode, string> = {
  driving: "auto",
  walking: "pedestrian",
  cycling: "bicycle",
};

interface ValhallaResponse {
  trip?: {
    legs?: Array<{
      shape?: string;
      summary?: { length?: number; time?: number };
    }>;
  };
  error?: string;
}

export class ValhallaRoutingProvider implements RoutingProvider {
  async route(mode: Mode, from: Position, to: Position): Promise<RouteResult> {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locations: [
          { lon: from[0], lat: from[1] },
          { lon: to[0], lat: to[1] },
        ],
        costing: COSTING_BY_MODE[mode],
        alternatives: 0,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new RoutingError(`路线服务返回 ${res.status}`, "upstream");
    }
    const data = (await res.json()) as ValhallaResponse;
    const leg = data.trip?.legs?.[0];
    if (!leg?.shape) {
      throw new RoutingError(data.error ?? "无法规划该路段", "no_route");
    }
    const geometry = decodePolyline6(leg.shape);
    const lengthKm = leg.summary?.length;
    const timeSec = leg.summary?.time;
    return {
      geometry,
      distanceM: lengthKm != null ? Math.round(lengthKm * 1000) : roughDistanceM(from, to),
      durationMin: timeSec != null ? Math.max(1, Math.round(timeSec / 60)) : 0,
    };
  }

  async snap(_mode: Mode, point: Position) {
    return { location: point, snappedDistanceM: 0 };
  }
}
