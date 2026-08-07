import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveWeather, regeocode } from "@/lib/lbs";

const UNCONFIGURED = process.env.AMAP_WEB_SERVICE_KEY;

function mockFetch(payload: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok,
    json: async () => payload,
  })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AMAP_WEB_SERVICE_KEY;
});

beforeEach(() => {
  if (UNCONFIGURED) process.env.AMAP_WEB_SERVICE_KEY = UNCONFIGURED;
  else delete process.env.AMAP_WEB_SERVICE_KEY;
});

describe("lbs regeocode", () => {
  it("解析城市/地址/POI 名称", async () => {
    process.env.AMAP_WEB_SERVICE_KEY = "k";
    mockFetch({
      status: "1",
      regeocode: {
        formatted_address: "海淀区中关村大街",
        addressComponent: { city: ["北京市"], adcode: "110105" },
        pois: [{ name: "中关村科技园" }],
      },
    });
    const info = await regeocode(116.307, 39.981);
    expect(info).toEqual({ address: "海淀区中关村大街", name: "中关村科技园", city: "北京市" });
  });

  it("city 为直辖市级用 adcode 兜底", async () => {
    process.env.AMAP_WEB_SERVICE_KEY = "k";
    mockFetch({ status: "1", regeocode: { addressComponent: { adcode: "110105" }, formatted_address: "x" } });
    const info = await regeocode(100, 40);
    expect(info.city).toBe("110105");
  });

  it("未配置密钥直接抛 map_service_not_configured", async () => {
    delete process.env.AMAP_WEB_SERVICE_KEY;
    await expect(regeocode(1, 1)).rejects.toThrow("map_service_not_configured");
  });

  it("缓存命中时不再发起请求", async () => {
    process.env.AMAP_WEB_SERVICE_KEY = "k";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "1", regeocode: { addressComponent: { city: "苏州市" } } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await regeocode(120.6, 31.3);
    await regeocode(120.6, 31.3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("lbs liveWeather", () => {
  it("解析 lives 返回实时天气，失败时返回 null", async () => {
    process.env.AMAP_WEB_SERVICE_KEY = "k";
    mockFetch({
      status: "1",
      lives: [{ city: "苏州", weather: "多云", temperature: "28", winddirection: "东风", windpower: "3", humidity: "55" }],
    });
    const live = await liveWeather("苏州市");
    expect(live).toMatchObject({ city: "苏州", weather: "多云", temperature: "28" });
    mockFetch({ status: "0", info: "参数错误" });
    expect(await liveWeather("不存在")).toBeNull();
  });
});