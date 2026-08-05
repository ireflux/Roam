import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { toPublicTrip } from "@/lib/db/repo";

type Ctx = { params: Promise<{ shareId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { shareId } = await params;
  if (!/^[A-Za-z0-9_-]{4,16}$/.test(shareId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const trip = await getRepo().getByShareId(shareId);
  if (!trip) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(toPublicTrip(trip));
}
