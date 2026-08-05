import { NextResponse } from "next/server";
import { getOwnerId } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { isTripData } from "@/lib/trip/validation";
import { requestTooLarge } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const trip = await getRepo().getById(id);
  if (!trip || trip.ownerId !== ownerId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(trip);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const tooLarge = requestTooLarge(req);
  if (tooLarge) return tooLarge;
  const { id } = await params;
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { data?: unknown; title?: string };
  if (body.data === undefined && body.title === undefined) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (body.data !== undefined && !isTripData(body.data)) {
    return NextResponse.json({ error: "invalid_trip_data" }, { status: 400 });
  }
  if (body.title !== undefined && typeof body.title !== "string") {
    return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  }

  const trip = await getRepo().update(id, ownerId, {
    data: body.data,
    title: typeof body.title === "string" ? body.title.trim().slice(0, 100) : undefined,
  });
  if (!trip) {
    return NextResponse.json({ error: "not_found_or_forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, updatedAt: trip.updatedAt });
}
