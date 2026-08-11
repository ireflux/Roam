import { afterEach, describe, expect, it, vi } from "vitest";
import { AmapRoutingProvider } from "@/lib/routing/amap";
import { RoutingError } from "@/lib/routing/provider";
import type { Position } from "@/lib/types";

const from: Position = [121.4737, 31.2304];
const to: Position = [121.4737, 31.2304];

describe("AmapRoutingProvider.reverseCity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("上游业务错误不被负缓存：两次 plan 同一坐标都会再次请求 regeo", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: "0", info: "INVALID_USER_KEY" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AMAP_WEB_SERVICE_KEY", "test-key");

    const provider = new AmapRoutingProvider();

    // 第一次 plan：reverseCity 对 from/to 各调一次，两次 fetch 均返回 status "0" → 抛 RoutingError
    await expect(provider.route("transit", from, to)).rejects.toThrow(RoutingError);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 第二次 plan 同一坐标：错误未被缓存，fetch 再次被调用（两次 plan 各 1 次/端点）
    await expect(provider.route("transit", from, to)).rejects.toThrow(RoutingError);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("错误响应抛出的 RoutingError 携带上游 message 与 upstream code", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: "0", info: "INVALID_USER_KEY" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AMAP_WEB_SERVICE_KEY", "test-key");

    const provider = new AmapRoutingProvider();
    const err = await provider.route("transit", from, to).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RoutingError);
    expect((err as RoutingError).message).toBe("INVALID_USER_KEY");
    expect((err as RoutingError).code).toBe("upstream");
  });
});