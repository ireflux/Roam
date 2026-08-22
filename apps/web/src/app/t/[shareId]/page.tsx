import { notFound } from "next/navigation";
import { getOwnerId } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { toPublicTrip } from "@/lib/db/repo";
import ShareView from "@/components/share/ShareView";

export default async function SharePage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(shareId)) notFound();
  const trip = await getRepo().getByShareId(shareId);
  if (!trip) notFound();
  const nickname = await getRepo().getNickname(trip.ownerId);

  let savedTripId: string | null = null;
  const ownerId = await getOwnerId();
  if (ownerId) {
    try {
      savedTripId = await getRepo().getSavedTripId(ownerId, shareId);
    } catch {
      // 收藏态查询失败不影响分享页主体
    }
  }
  return <ShareView trip={toPublicTrip(trip)} nickname={nickname} savedTripId={savedTripId} />;
}
