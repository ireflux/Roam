import * as SecureStore from "expo-secure-store";
import { API_BASE_URL, setAuthToken } from "@/lib/env";

const KEY_OWNER = "roam.device.ownerId";
const KEY_TOKEN = "roam.device.token";

export interface DeviceIdentity {
  ownerId: string;
  token: string;
}

let identityPromise: Promise<DeviceIdentity> | null = null;

/**
 * 设备身份：首启注册匿名 owner + Bearer 令牌并持久化到 SecureStore；
 * 之后所有请求经 setAuthToken 注入。失败抛出，由调用方决定重试策略。
 */
export async function ensureIdentity(): Promise<DeviceIdentity> {
  if (!identityPromise) {
    identityPromise = (async () => {
      const [ownerId, token] = await Promise.all([
        SecureStore.getItemAsync(KEY_OWNER),
        SecureStore.getItemAsync(KEY_TOKEN),
      ]);
      let identity: DeviceIdentity;
      if (ownerId && token) {
        identity = { ownerId, token };
      } else {
        const res = await fetch(`${API_BASE_URL}/api/auth/device-token`, { method: "POST" });
        if (!res.ok) throw new Error(`device register failed: ${res.status}`);
        const data = (await res.json()) as { ownerId: string; token: string };
        await Promise.all([
          SecureStore.setItemAsync(KEY_OWNER, data.ownerId),
          SecureStore.setItemAsync(KEY_TOKEN, data.token),
        ]);
        identity = data;
      }
      setAuthToken(identity.token);
      return identity;
    })().catch((err) => {
      // 失败不缓存，下次调用重试
      identityPromise = null;
      throw err;
    });
  }
  return identityPromise;
}

/** 登出语义：重置为新匿名设备（spec §9）。 */
export async function resetIdentity(): Promise<DeviceIdentity> {
  await SecureStore.deleteItemAsync(KEY_OWNER);
  await SecureStore.deleteItemAsync(KEY_TOKEN);
  identityPromise = null;
  return ensureIdentity();
}
