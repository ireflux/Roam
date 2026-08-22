import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getRepo } from "@/lib/db";
import { sha256Hex } from "@/lib/auth";

/** 每 IP 每小时最多 10 次设备注册（内存限速，serverless 多实例下为尽力而为的防线）。 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) return true;
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 10_000) hits.clear();
  return false;
}

/** App 首启注册设备：创建匿名 owner + Bearer 令牌。token 明文仅在本次响应返回。 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }
  const ownerId = crypto.randomUUID();
  const token = nanoid(48);
  await getRepo().createApiToken(sha256Hex(token), ownerId);
  return NextResponse.json({ ownerId, token }, { status: 201 });
}
