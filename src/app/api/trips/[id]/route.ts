import { NextResponse } from "next/server";
import { getOwnerId } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { isTripData } from "@/lib/trip/validation";
import { parseJsonBody } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** 行程 PATCH 上限：applyRoute 单段几何最多 2500 点（约 57KB/段），5 段即超默认 256KB，故放宽到 2MB。 */
const MAX_TRIP_PATCH_BYTES = 2_000_000;

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const trip = await getRepo().getById(id);
  if (!trip || trip.ownerId !== ownerId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(trip);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { body: bodyRaw, response: bodyError } = await parseJsonBody(req, MAX_TRIP_PATCH_BYTES);
  if (bodyError) return bodyError;
  const body = (bodyRaw ?? {}) as {
    data?: unknown;
    title?: string;
    expectedUpdatedAt?: string;
    force?: boolean;
  };
  if (body.data === undefined && body.title === undefined) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (body.data !== undefined && !isTripData(body.data)) {
    return NextResponse.json({ error: "invalid_trip_data" }, { status: 400 });
  }
  if (body.title !== undefined && typeof body.title !== "string") {
    return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  }
  if (body.expectedUpdatedAt !== undefined && Number.isNaN(Date.parse(body.expectedUpdatedAt))) {
    return NextResponse.json({ error: "invalid_expected_updated_at" }, { status: 400 });
  }
  if (body.force !== undefined && typeof body.force !== "boolean") {
    return NextResponse.json({ error: "invalid_force" }, { status: 400 });
  }
  if (body.force !== true && body.expectedUpdatedAt === undefined) {
    return NextResponse.json({ error: "expected_updated_at_required" }, { status: 400 });
  }

  const trip = await getRepo().update(id, ownerId, {
    data: body.data,
    title: typeof body.title === "string" ? body.title.trim().slice(0, 100) : undefined,
    expectedUpdatedAt: body.force === true ? undefined : body.expectedUpdatedAt,
  });
  if (!trip) {
    // update 返回 null 可能是 not_found/无权限，也可能是 expectedUpdatedAt 不匹配（并发冲突）。
    // 用 getById 区分：行程存在且属于该 owner → 409 携带服务端最新 updatedAt。
    const existing = await getRepo().getById(id);
    if (existing && existing.ownerId === ownerId) {
      return NextResponse.json({ error: "conflict", serverUpdatedAt: existing.updatedAt }, { status: 409 });
    }
    return NextResponse.json({ error: "not_found_or_forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, updatedAt: trip.updatedAt });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const deleted = await getRepo().remove(id, ownerId);
  if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
