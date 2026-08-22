import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/server";
import { getRepo } from "@/lib/db";

export const OWNER_COOKIE = "roam_owner_id";
export const NICK_COOKIE = "roam_nickname";

const MAX_AGE = 60 * 60 * 24 * 365;

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** 请求是否携带 Authorization 头。有头即视为移动端权威身份来源：令牌无效 → null（401），不回落 cookie。 */
async function hasBearerHeader(): Promise<boolean> {
  const h = await headers();
  return /^Bearer\s+\S+$/i.test(h.get("authorization") ?? "");
}

/** 解析 Bearer 设备令牌对应的 ownerId；无头或无效返回 null。 */
export async function getBearerOwnerId(): Promise<string | null> {
  if (!(await hasBearerHeader())) return null;
  const h = await headers();
  const token = (/^Bearer\s+(\S+)$/i.exec(h.get("authorization") ?? "") ?? [])[1];
  if (!token) return null;
  return getRepo().resolveApiToken(sha256Hex(token));
}

/**
 * ownerId 决议（spec 3.3）：请求携带有效登录会话 → 用户 id；携带 Bearer → 令牌 ownerId；
 * 否则回落到匿名 cookie。登录后用户与匿名 cookie 的行程通过 /api/claim 认领合并。
 */
export async function getOrCreateOwnerId(): Promise<string> {
  const sessionUser = await getSessionUser();
  if (sessionUser) return sessionUser.id;
  if (await hasBearerHeader()) {
    const bearerOwnerId = await getBearerOwnerId();
    if (bearerOwnerId) return bearerOwnerId;
    throw new BearerAuthError("invalid_device_token");
  }

  const store = await cookies();
  const existing = store.get(OWNER_COOKIE)?.value;
  if (existing && existing.length >= 8) return existing;
  const id = crypto.randomUUID();
  store.set(OWNER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
  return id;
}

export async function getOwnerId(): Promise<string | null> {
  const sessionUser = await getSessionUser();
  if (sessionUser) return sessionUser.id;
  if (await hasBearerHeader()) return getBearerOwnerId();

  const store = await cookies();
  const existing = store.get(OWNER_COOKIE)?.value;
  return existing && existing.length >= 8 ? existing : null;
}

/** Bearer 令牌无效时由 getOrCreateOwnerId 抛出，路由层映射为 401，避免误建匿名身份。 */
export class BearerAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BearerAuthError";
  }
}

export async function setNicknameCookie(nickname: string): Promise<void> {
  const store = await cookies();
  store.set(NICK_COOKIE, nickname, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}