import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { toPublicTrip } from "@/lib/db/repo";
import ShareView from "@/components/share/ShareView";

export default async function SharePage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(shareId)) notFound();
  const trip = await getRepo().getByShareId(shareId);
  if (!trip) notFound();
  const nickname = await getRepo().getNickname(trip.ownerId);
  return <ShareView trip={toPublicTrip(trip)} nickname={nickname} />;
}
