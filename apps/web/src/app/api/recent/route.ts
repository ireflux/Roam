import { NextResponse } from "next/server";
import { getOwnerId } from "@/lib/auth";
import { getRepo } from "@/lib/db";

/** 无 since：首页最近列表。有 since（ISO 时间）：移动端增量拉取，含软删 tombstone id。 */
export async function GET(req: Request) {
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ trips: [], deletedIds: [] });

  const since = new URL(req.url).searchParams.get("since");
  if (since === null) {
    const trips = await getRepo().listByOwner(ownerId, 20);
    return NextResponse.json({ trips, deletedIds: [] });
  }
  const sinceDate = new Date(since);
  if (Number.isNaN(sinceDate.getTime())) {
    return NextResponse.json({ error: "invalid_since" }, { status: 400 });
  }
  const delta = await getRepo().listChangedSince(ownerId, sinceDate, 100);
  return NextResponse.json(delta);
}
