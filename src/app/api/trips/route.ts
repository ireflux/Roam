import { NextResponse } from "next/server";
import { getOrCreateOwnerId } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { nanoid } from "nanoid";
import { parseJsonBody } from "@/lib/http";

export async function POST(req: Request) {
  const ownerId = await getOrCreateOwnerId();
  const { body: bodyRaw, response: bodyError } = await parseJsonBody(req);
  if (bodyError) return bodyError;
  const body = (bodyRaw ?? {}) as { title?: string };
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 100) : undefined;
  const trip = await getRepo().create({
    ownerId,
    shareId: nanoid(8),
    title: title || undefined,
    data: { days: [], stops: [], segments: [] },
  });
  return NextResponse.json({ id: trip.id, shareId: trip.shareId }, { status: 201 });
}
