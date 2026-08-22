import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/server";

/**
 * Web 配对确认页调用：已登录用户输入 App 展示的 6 位配对码。
 * 成功后设备令牌改指该用户 id，并把设备匿名名下的行程/昵称过户合并（复用 claim 机制）。
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  const tokenHash = await getRepo().consumeDevicePair(code);
  if (!tokenHash) return NextResponse.json({ error: "invalid_or_expired" }, { status: 400 });

  // 绑定前先取旧 ownerId 用于认领；绑定失败（令牌已被删）视为配对失效
  const deviceOwnerId = await getRepo().resolveApiToken(tokenHash);
  if (!deviceOwnerId) return NextResponse.json({ error: "invalid_or_expired" }, { status: 400 });

  const bound = await getRepo().bindApiTokenOwner(tokenHash, user.id);
  if (!bound) return NextResponse.json({ error: "invalid_or_expired" }, { status: 400 });

  let claimedTrips = 0;
  if (deviceOwnerId !== user.id) {
    claimedTrips = await getRepo().claimTrips(deviceOwnerId, user.id);
    await getRepo().claimProfile(deviceOwnerId, user.id);
  }
  return NextResponse.json({ ok: true, ownerId: user.id, claimedTrips });
}
