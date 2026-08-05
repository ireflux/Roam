import "server-only";
import { AmapRoutingProvider } from "@/lib/routing/amap";
import type { RoutingProvider } from "@/lib/routing/provider";

export function getRoutingProvider(): RoutingProvider {
  return new AmapRoutingProvider();
}
