import { NextResponse } from "next/server";
import { getOrCreateOwnerId } from "@/lib/auth";
import { getSessionUser } from "@/lib/auth/server";
import { getRepo } from "@/lib/db";
import { nanoid } from "nanoid";
import { parseJsonBody } from "@/lib/http";
import { isTripData } from "@/lib/trip/validation";

export async function POST(req: Request) {
  const { body: bodyRaw, response: bodyError } = await parseJsonBody(req);
  if (bodyError) return bodyError;
  const body = (bodyRaw ?? {}) as { title?: string; data?: unknown; sourceShareId?: string };

  // 收藏动作（带 sourceShareId）必须登录：先复刻行程，再登记收藏
  if (body.sourceShareId !== undefined && (typeof body.sourceShareId !== "string" || !/^[A-Za-z0-9_-]{4,32}$/.test(body.sourceShareId))) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (body.data !== undefined && !isTripData(body.data)) {
    return NextResponse.json({ error: "invalid_trip_data" }, { status: 400 });
  }

  const isSave = body.sourceShareId !== undefined;
  const ownerId = isSave ? (await getSessionUser())?.id ?? null : await getOrCreateOwnerId();
  if (!ownerId) {
    return NextResponse.json({ error: "login_required" }, { status: 401 });
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 100) : undefined;

  // 已收藏过（按 owner + source 天然去重）→ 幂等返回原复制品，不重复创建
  if (isSave) {
    const existing = await getRepo().getSavedTripId(ownerId, body.sourceShareId!);
    if (existing) {
      return NextResponse.json({ id: existing, saved: true }, { status: 200 });
    }
  }

  const trip = await getRepo().create({
    ownerId,
    shareId: nanoid(16),
    title: title || undefined,
    data: isSave
      ? (body.data as import("@/lib/types").TripData)
      : { days: [], stops: [], segments: [] },
  });

  if (isSave) {
    await getRepo().saveSharedTrip(ownerId, body.sourceShareId!, trip.id);
  }
  return NextResponse.json({ id: trip.id, shareId: trip.shareId, saved: isSave }, { status: 201 });
}