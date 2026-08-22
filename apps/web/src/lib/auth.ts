import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth/server";

export const OWNER_COOKIE = "roam_owner_id";
export const NICK_COOKIE = "roam_nickname";

const MAX_AGE = 60 * 60 * 24 * 365;

/**
 * ownerId 决议（spec 3.3）：请求携带有效登录会话 → 用户 id；否则回落到匿名 cookie。
 * 登录后用户与匿名 cookie 的行程通过 /api/claim 认领合并。
 */
export async function getOrCreateOwnerId(): Promise<string> {
  const sessionUser = await getSessionUser();
  if (sessionUser) return sessionUser.id;

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

  const store = await cookies();
  const existing = store.get(OWNER_COOKIE)?.value;
  return existing && existing.length >= 8 ? existing : null;
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