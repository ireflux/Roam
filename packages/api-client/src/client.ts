import type { Position, PublicTrip, SegmentPart, Trip, TripData } from "@roam/core";

/**
 * 类型化 API 客户端：Web（相对路径，走 Next 同源）与 Mobile（绝对地址）共用。
 * fetch 由调用方注入；身份凭证由 authProvider 注入（web=cookie 自动携带，mobile=Bearer）。
 */
export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** 每次请求前附加认证头（移动端 Bearer token）；web 默认不附加。 */
  getAuthHeader?: () => Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  const doFetch = options.fetchImpl ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    const auth = options.getAuthHeader?.() ?? {};
    for (const [k, v] of Object.entries(auth)) headers.set(k, v);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const res = await doFetch(`${baseUrl}${path}`, { ...init, headers });
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const message =
        typeof body === "object" && body !== null && "error" in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${res.status}`;
      throw new ApiError(res.status, message, body);
    }
    return body as T;
  }

  return {
    async createTrip(input: { title?: string; data?: TripData }): Promise<Trip> {
      return request<Trip>("/api/trips", { method: "POST", body: JSON.stringify(input ?? {}) });
    },
    async getTrip(id: string): Promise<Trip> {
      return request<Trip>(`/api/trips/${id}`);
    },
    async updateTrip(
      id: string,
      input: { data?: TripData; title?: string; expectedUpdatedAt?: string },
    ): Promise<Trip | null> {
      return request<Trip | null>(`/api/trips/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    },
    /** 移动端同步通道：幂等 upsert。冲突时服务端返回 409 携带 serverUpdatedAt。 */
    async putTrip(
      id: string,
      input: {
        data?: TripData;
        title?: string;
        deleted?: boolean;
        expectedUpdatedAt?: string;
        /** 冲突解决「以本地为准」：跳过乐观并发校验。 */
        force?: boolean;
      },
    ): Promise<{ ok: true; trip: Trip }> {
      return request(`/api/trips/${id}`, { method: "PUT", body: JSON.stringify(input) });
    },
    async deleteTrip(id: string): Promise<boolean> {
      return request<boolean>(`/api/trips/${id}`, { method: "DELETE" });
    },
    async recentTrips(limit?: number): Promise<{ trips: Trip[]; deletedIds: string[] }> {
      return request(`/api/recent${limit ? `?limit=${limit}` : ""}`);
    },
    /** 增量拉取：updatedAt > since 的行程与 tombstone。 */
    async recentSince(since: string): Promise<{ trips: Trip[]; deletedIds: string[] }> {
      return request(`/api/recent?since=${encodeURIComponent(since)}`);
    },
    /** 设备注册：匿名 owner + Bearer 令牌（明文仅此一次）。 */
    async registerDevice(): Promise<{ ownerId: string; token: string }> {
      const res = await doFetch(`${baseUrl}/api/auth/device-token`, { method: "POST" });
      if (!res.ok) throw new ApiError(res.status, "device register failed");
      return (await res.json()) as { ownerId: string; token: string };
    },
    /** 发起配对：返回一次性 6 位配对码。 */
    async createDevicePair(): Promise<{ code: string; expiresAt: string }> {
      return request("/api/auth/device-pair", { method: "POST" });
    },
    async shareTrip(shareId: string): Promise<PublicTrip> {
      return request<PublicTrip>(`/api/trips/share/${shareId}`);
    },
    async searchPlaces(q: string): Promise<Array<{ id: string; name: string; lat: number; lng: number; address?: string }>> {
      return request(`/api/search?q=${encodeURIComponent(q)}`);
    },
    async regeocode(lat: number, lng: number): Promise<{ name?: string; city?: string }> {
      return request(`/api/regeocode?lat=${lat}&lng=${lng}`);
    },
    async planRoute(input: { mode: string; from: Position; to: Position }): Promise<{
      geometry: Position[];
      distanceM: number;
      durationMin: number;
      fallback?: boolean;
      parts?: SegmentPart[];
    }> {
      return request("/api/route", { method: "POST", body: JSON.stringify(input) });
    },
    async weather(city: string): Promise<unknown> {
      return request(`/api/weather?city=${encodeURIComponent(city)}`);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
