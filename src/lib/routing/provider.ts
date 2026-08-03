import type { Mode, Position } from "@/lib/types";

export interface RouteResult {
  geometry: Position[];
  distanceM: number;
  durationMin: number;
}

export interface SnapResult {
  location: Position;
  snappedDistanceM: number;
}

export class RoutingError extends Error {
  constructor(
    message: string,
    public readonly code: "quota" | "no_route" | "upstream" | "config",
  ) {
    super(message);
    this.name = "RoutingError";
  }
}

export interface RoutingProvider {
  route(mode: Mode, from: Position, to: Position): Promise<RouteResult>;
  snap(mode: Mode, point: Position): Promise<SnapResult>;
}

export const PROFILE_BY_MODE: Record<Mode, string> = {
  driving: "driving-car",
  walking: "foot-walking",
  cycling: "cycling-regular",
};
