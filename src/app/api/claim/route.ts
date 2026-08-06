import { NextResponse } from "next/server";
import { getOrCreateOwnerId, setNicknameCookie } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { parseJsonBody } from "@/lib/http";

export async function POST(req: Request) {
  const ownerId = await getOrCreateOwnerId();
  const { body: bodyRaw, response: bodyError } = await parseJsonBody(req, 4_000);
  if (bodyError) return bodyError;
  const body = (bodyRaw ?? {}) as { nickname?: string };
  const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 30) : "";
  if (!nickname) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  await getRepo().setNickname(ownerId, nickname);
  await setNicknameCookie(nickname);
  return NextResponse.json({ ok: true, nickname });
}
