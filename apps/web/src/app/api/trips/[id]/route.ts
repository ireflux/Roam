import { NextResponse } from "next/server";
import { getOwnerId } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { isTripData } from "@roam/core";
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 移动端同步专用幂等 upsert：id 不存在则建档（服务端生成 shareId 并随响应回填），
 * 存在则按 owner + expectedUpdatedAt 乐观并发更新/软删。Web 端不使用此通道。
 */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const { body: bodyRaw, response: bodyError } = await parseJsonBody(req, MAX_TRIP_PATCH_BYTES);
  if (bodyError) return bodyError;
  const body = (bodyRaw ?? {}) as {
    data?: unknown;
    title?: string;
    deleted?: unknown;
    expectedUpdatedAt?: string;
    force?: unknown;
  };
  if (body.data === undefined && body.title === undefined && body.deleted === undefined) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (body.data !== undefined && !isTripData(body.data)) {
    return NextResponse.json({ error: "invalid_trip_data" }, { status: 400 });
  }
  if (body.title !== undefined && typeof body.title !== "string") {
    return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  }
  if (body.deleted !== undefined && typeof body.deleted !== "boolean") {
    return NextResponse.json({ error: "invalid_deleted" }, { status: 400 });
  }
  if (body.expectedUpdatedAt !== undefined && Number.isNaN(Date.parse(body.expectedUpdatedAt))) {
    return NextResponse.json({ error: "invalid_expected_updated_at" }, { status: 400 });
  }
  if (body.force !== undefined && typeof body.force !== "boolean") {
    return NextResponse.json({ error: "invalid_force" }, { status: 400 });
  }
  // 移动端同步约定：无基准的更新必须显式 force，防止静默丢并发保护
  if (body.data !== undefined && body.expectedUpdatedAt === undefined && body.force !== true) {
    return NextResponse.json({ error: "expected_updated_at_required" }, { status: 400 });
  }

  const result = await getRepo().upsertTrip({
    id,
    ownerId,
    data: body.data,
    title: typeof body.title === "string" ? body.title.trim().slice(0, 100) : undefined,
    deleted: body.deleted as boolean | undefined,
    expectedUpdatedAt: body.expectedUpdatedAt,
    force: body.force as boolean | undefined,
  });
  if (result.ok) return NextResponse.json({ ok: true, trip: result.trip });
  if (result.reason === "forbidden") return NextResponse.json({ error: "not_found_or_forbidden" }, { status: 403 });
  return NextResponse.json({ error: "conflict", serverUpdatedAt: result.serverUpdatedAt }, { status: 409 });
}
