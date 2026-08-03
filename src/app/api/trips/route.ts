import { NextResponse } from "next/server";
import { getOrCreateOwnerId } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  const ownerId = await getOrCreateOwnerId();
  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const trip = await getRepo().create({
    ownerId,
    shareId: nanoid(8),
    title: body.title?.trim().slice(0, 100) || undefined,
    data: { days: [], stops: [], segments: [] },
  });
  return NextResponse.json({ id: trip.id, shareId: trip.shareId }, { status: 201 });
}
