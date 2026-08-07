import "server-only";

// 高德 Web 服务（逆地理编码 / 实时天气）的服务端共享助手。
// 同一进程内做短 TTL 缓存：地址通常不变（1h），天气 10 分钟刷新，
// 兼顾频繁渲染编辑器/分享页时的配额消耗。Serverless 多实例下命中率有限（与 routing/cache.ts 一致）。

const TTL_REGEO_MS = 1000 * 60 * 60;
const TTL_WEATHER_MS = 1000 * 60 * 10;
const MAX_ENTRIES = 2_000;

const store = new Map<string, { ts: number; value: unknown }>();

async function cachedGet<T>(key: string, ttlMs: number, read: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.value as T;
  const value = await read();
  store.set(key, { ts: Date.now(), value });
  if (store.size > MAX_ENTRIES) {
    store.delete(store.keys().next().value as string);
  }
  return value;
}

function amapKey(): string {
  const value = process.env.AMAP_WEB_SERVICE_KEY;
  if (!value) throw new Error("map_service_not_configured");
  return value;
}

export interface RegeoInfo {
  address: string;
  name: string;
  city: string;
}

type RegeoResponse = {
  status?: string;
  regeocode?: {
    formatted_address?: string;
    addressComponent?: { city?: string[] | string; adcode?: string };
    pois?: Array<{ name?: string }>;
    aois?: Array<{ name?: string }>;
  };
};

export async function regeocode(lng: number, lat: number): Promise<RegeoInfo> {
  const key = `regeo:${lng.toFixed(6)},${lat.toFixed(6)}`;
  return cachedGet<RegeoInfo>(key, TTL_REGEO_MS, async () => {
    const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
    url.searchParams.set("key", amapKey());
    url.searchParams.set("location", `${lng.toFixed(6)},${lat.toFixed(6)}`);
    url.searchParams.set("extensions", "all");
    url.searchParams.set("radius", "1000");
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("upstream");
    const data = await response.json() as RegeoResponse;
    if (data.status !== "1" || !data.regeocode) throw new Error("amap_error");
    const ac = data.regeocode.addressComponent ?? {};
    const cityRaw = ac.city;
    const city = (Array.isArray(cityRaw) ? cityRaw[0] : cityRaw) || ac.adcode || "";
    return {
      address: data.regeocode.formatted_address ?? "",
      name: data.regeocode.pois?.[0]?.name ?? data.regeocode.aois?.[0]?.name ?? "",
      city,
    };
  });
}

export interface LiveWeather {
  city: string;
  weather: string;
  temperature: string;
  windDirection: string;
  windPower: string;
  humidity: string;
}

/** 实时天气（extensions=base）。city 接受城市名或 adcode；无结果返回 null。 */
export async function liveWeather(city: string): Promise<LiveWeather | null> {
  const key = `weather:${city}`;
  return cachedGet<LiveWeather | null>(key, TTL_WEATHER_MS, async () => {
    const url = new URL("https://restapi.amap.com/v3/weather/weatherInfo");
    url.searchParams.set("key", amapKey());
    url.searchParams.set("city", city);
    url.searchParams.set("extensions", "base");
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("upstream");
    const data = await response.json() as {
      status?: string;
      lives?: Array<{
        city?: string;
        weather?: string;
        temperature?: string;
        winddirection?: string;
        windpower?: string;
        humidity?: string;
      }>;
    };
    if (data.status !== "1") return null;
    const live = data.lives?.[0];
    if (!live) return null;
    return {
      city: live.city ?? city,
      weather: live.weather ?? "未知",
      temperature: live.temperature ?? "",
      windDirection: live.winddirection ?? "",
      windPower: live.windpower ?? "",
      humidity: live.humidity ?? "",
    };
  });
}