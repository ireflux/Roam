import { NextResponse } from "next/server";
import { getOwnerId } from "@/lib/auth";
import { getRepo } from "@/lib/db";

export async function GET() {
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ trips: [] });
  const trips = await getRepo().listByOwner(ownerId, 20);
  return NextResponse.json({ trips });
}