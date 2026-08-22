import Constants from "expo-constants";
import { createApiClient, type ApiClient } from "@roam/api-client";

/** API 基地址：开发用 EXPO_PUBLIC_API_BASE_URL 指向本机/局域网 Web 服务；生产为线上域名。 */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export const AMAP_ANDROID_KEY: string =
  (process.env.AMAP_ANDROID_KEY as string | undefined) ??
  (Constants.expoConfig?.extra?.amapAndroidKey as string | undefined) ??
  "";
export const AMAP_IOS_KEY: string =
  (process.env.AMAP_IOS_KEY as string | undefined) ??
  (Constants.expoConfig?.extra?.amapIOSKey as string | undefined) ??
  "";

let client: ApiClient | null = null;

/** 带 Bearer 注入的 API 客户端；未初始化会话时返回无鉴头实例（分享页等公开接口够用）。 */
export function api(): ApiClient {
  if (!client) client = createApiClient({ baseUrl: API_BASE_URL });
  return client;
}

/** 会话就绪后替换为带鉴头的实例（由 session.ensureIdentity 调用）。 */
export function setAuthToken(token: string | null): void {
  client = createApiClient({
    baseUrl: API_BASE_URL,
    getAuthHeader: token ? () => ({ Authorization: `Bearer ${token}` }) : undefined,
  });
}
