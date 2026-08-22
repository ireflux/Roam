import { NextResponse } from "next/server";
import { getOwnerId } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { toPublicTrip } from "@/lib/db/repo";

type Ctx = { params: Promise<{ shareId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { shareId } = await params;
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(shareId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const trip = await getRepo().getByShareId(shareId);
  if (!trip) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 登录用户附加收藏态（匿名/未配置认证时为 null，前端据此隐藏收藏按钮）
  let savedTripId: string | null = null;
  const ownerId = await getOwnerId();
  if (ownerId) {
    try {
      savedTripId = await getRepo().getSavedTripId(ownerId, shareId);
    } catch {
      // 收藏态查询失败不影响分享页主体
    }
  }
  return NextResponse.json({ ...toPublicTrip(trip), savedTripId });
}