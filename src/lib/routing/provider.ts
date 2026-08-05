import type { Mode, Position } from "@/lib/types";

export interface RouteResult {
  geometry: Position[];
  distanceM: number;
  durationMin: number;
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
}
