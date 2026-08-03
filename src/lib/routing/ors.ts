import "server-only";
import {
  PROFILE_BY_MODE,
  RoutingError,
  type RoutingProvider,
  type RouteResult,
  type SnapResult,
} from "@/lib/routing/provider";
import type { Mode, Position } from "@/lib/types";
import { roughDistanceM } from "@/lib/trip/geo";

const BASE = "https://api.openrouteservice.org/v2";

let key: string | null = null;

function getKey(): string {
  if (key === null) key = process.env.ORS_API_KEY ?? "";
  if (!key) {
    throw new RoutingError("未配置 ORS_API_KEY 环境变量", "config");
  }
  return key;
}

interface OrsDirectionsResponse {
  features: Array<{
    geometry: { type: "LineString"; coordinates: Position[] };
    properties: { summary?: { distance?: number; duration?: number } };
  }>;
}

interface OrsSnapResponse {
  locations: Array<{ location: Position; snapped_distance?: number }>;
}

export class OrsRoutingProvider implements RoutingProvider {
  private async fetchJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getKey(),
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 403) {
      throw new RoutingError("路线服务配额已用尽", "quota");
    }
    if (!res.ok) {
      throw new RoutingError(`路线服务返回 ${res.status}`, "upstream");
    }
    return (await res.json()) as T;
  }

  async route(mode: Mode, from: Position, to: Position): Promise<RouteResult> {
    const profile = PROFILE_BY_MODE[mode];
    const data = await this.fetchJson<OrsDirectionsResponse>(`/directions/${profile}/geojson`, {
      coordinates: [from, to],
    });
    const feature = data.features?.[0];
    const coords = feature?.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      throw new RoutingError("无法规划该路段", "no_route");
    }
    const summary = feature.properties?.summary;
    const distanceM = summary?.distance ?? roughDistanceM(from, to);
    const durationMin = summary?.duration != null ? Math.max(1, Math.round(summary.duration / 60)) : 0;
    return { geometry: coords, distanceM, durationMin };
  }

  async snap(mode: Mode, point: Position): Promise<SnapResult> {
    const profile = PROFILE_BY_MODE[mode];
    const data = await this.fetchJson<OrsSnapResponse>(`/snap/${profile}`, {
      locations: [point],
    });
    const loc = data.locations?.[0];
    if (!loc?.location) {
      return { location: point, snappedDistanceM: Infinity };
    }
    return {
      location: loc.location as Position,
      snappedDistanceM: loc.snapped_distance ?? 0,
    };
  }
}