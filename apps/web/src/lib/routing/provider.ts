import type { Mode, Position, SegmentPart } from "@roam/core";

export interface RouteResult {
  geometry: Position[];
  distanceM: number;
  durationMin: number;
  /** 公交/地铁段的可选子段（公交实线 + 步行虚线），供地图分段渲染。 */
  parts?: SegmentPart[];
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
