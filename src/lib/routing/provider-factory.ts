import "server-only";
import { OrsRoutingProvider } from "@/lib/routing/ors";
import { ValhallaRoutingProvider } from "@/lib/routing/valhalla";
import type {
  RoutingProvider,
  RoutingError as Re,
  RouteResult,
  SnapResult,
} from "@/lib/routing/provider";
import type { Mode, Position } from "@/lib/types";

class FallbackProvider implements RoutingProvider {
  constructor(
    private readonly primary: RoutingProvider,
    private readonly fallback: RoutingProvider,
  ) {}

  private async or<T>(fn: (p: RoutingProvider) => Promise<T>): Promise<T> {
    try {
      return await fn(this.primary);
    } catch (e) {
      const routingErr = e as Re | undefined;
      if (routingErr?.code === "config") throw e;
      return await fn(this.fallback);
    }
  }

  async route(mode: Mode, from: Position, to: Position): Promise<RouteResult> {
    return this.or((p) => p.route(mode, from, to));
  }

  async snap(mode: Mode, point: Position): Promise<SnapResult> {
    return this.or((p) => p.snap(mode, point));
  }
}

export function getRoutingProvider(): RoutingProvider {
  if (!process.env.ORS_API_KEY) return new ValhallaRoutingProvider();
  return new FallbackProvider(new OrsRoutingProvider(), new ValhallaRoutingProvider());
}

export function hasOrsKey(): boolean {
  return Boolean(process.env.ORS_API_KEY);
}
