import { NextResponse } from "next/server";
import { getOrCreateOwnerId, setNicknameCookie } from "@/lib/auth";
import { getRepo } from "@/lib/db";

export async function POST(req: Request) {
  const ownerId = await getOrCreateOwnerId();
  const body = (await req.json().catch(() => ({}))) as { nickname?: string };
  const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 30) : "";
  if (!nickname) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  await getRepo().setNickname(ownerId, nickname);
  await setNicknameCookie(nickname);
  return NextResponse.json({ ok: true, nickname });
}
