import { NextResponse } from "next/server";
import { getOwnerId, setNicknameCookie } from "@/lib/auth";
import { getSessionUser } from "@/lib/auth/server";
import { getRepo } from "@/lib/db";
import { parseJsonBody } from "@/lib/http";

/**
 * 昵称 + 认领一体（spec 3.3）：
 * - 无登录态 → 仅保存/更新匿名昵称（原行为）；
 * - 有登录态 → 把匿名 cookie 名下的行程与昵称过户给登录用户，再按需更新昵称。
 */
export async function POST(req: Request) {
  const { body: bodyRaw, response: bodyError } = await parseJsonBody(req, 4_000);
  if (bodyError) return bodyError;
  const body = (bodyRaw ?? {}) as { nickname?: string };
  const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 30) : "";

  const sessionUser = await getSessionUser();
  const cookieOwner = await getOwnerId();

  let claimed = 0;
  let targetOwner = sessionUser?.id ?? cookieOwner;
  if (sessionUser && cookieOwner && cookieOwner !== sessionUser.id) {
    claimed = await getRepo().claimTrips(cookieOwner, sessionUser.id);
    await getRepo().claimProfile(cookieOwner, sessionUser.id);
    targetOwner = sessionUser.id;
  }
  if (!targetOwner && !nickname) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (nickname && targetOwner) {
    await getRepo().setNickname(targetOwner, nickname);
    await setNicknameCookie(nickname);
  }
  return NextResponse.json({ ok: true, authed: Boolean(sessionUser), claimed, nickname: nickname || undefined });
}