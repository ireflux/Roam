import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOwnerId, NICK_COOKIE } from "@/lib/auth";
import { getRepo } from "@/lib/db";

export async function GET() {
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ nickname: null });
  const store = await cookies();
  const cookieNick = store.get(NICK_COOKIE)?.value ?? null;
  const nickname = cookieNick ?? (await getRepo().getNickname(ownerId));
  return NextResponse.json({ nickname });
}