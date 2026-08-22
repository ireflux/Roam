import type { PublicTrip, Trip, TripData } from "@roam/core";

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
    async deleteTrip(id: string): Promise<boolean> {
      return request<boolean>(`/api/trips/${id}`, { method: "DELETE" });
    },
    async recentTrips(limit?: number): Promise<{ trips: Trip[] }> {
      return request<{ trips: Trip[] }>(`/api/recent${limit ? `?limit=${limit}` : ""}`);
    },
    async shareTrip(shareId: string): Promise<PublicTrip> {
      return request<PublicTrip>(`/api/trips/share/${shareId}`);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
