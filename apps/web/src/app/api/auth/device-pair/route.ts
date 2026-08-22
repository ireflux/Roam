import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { getRepo } from "@/lib/db";
import { getBearerOwnerId, sha256Hex } from "@/lib/auth";

const PAIR_TTL_MS = 5 * 60 * 1000;

function tokenFromHeader(req: Request): string | null {
  const raw = req.headers.get("authorization") ?? "";
  return (/^Bearer\s+(\S+)$/i.exec(raw) ?? [])[1] ?? null;
}

/** App 发起配对：需有效设备令牌。返回 6 位数字配对码，5 分钟内有效、一次性消费。 */
export async function POST(req: Request) {
  const ownerId = await getBearerOwnerId();
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = tokenFromHeader(req);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const expiresAt = new Date(Date.now() + PAIR_TTL_MS);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await getRepo().createDevicePair(code, sha256Hex(token), ownerId, expiresAt);
  return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
}
