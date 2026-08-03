import { cookies } from "next/headers";

export const OWNER_COOKIE = "roam_owner_id";
export const NICK_COOKIE = "roam_nickname";

const MAX_AGE = 60 * 60 * 24 * 365;

export async function getOrCreateOwnerId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(OWNER_COOKIE)?.value;
  if (existing && existing.length >= 8) return existing;
  const id = crypto.randomUUID();
  store.set(OWNER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
  return id;
}

export async function getOwnerId(): Promise<string | null> {
  const store = await cookies();
  const existing = store.get(OWNER_COOKIE)?.value;
  return existing && existing.length >= 8 ? existing : null;
}

export async function setNicknameCookie(nickname: string): Promise<void> {
  const store = await cookies();
  store.set(NICK_COOKIE, nickname, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}
