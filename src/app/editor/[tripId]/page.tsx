import { notFound } from "next/navigation";
import Link from "next/link";
import { getOwnerId } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import Editor from "@/components/editor/Editor";

export default async function EditorPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const [trip, ownerId] = await Promise.all([getRepo().getById(tripId), getOwnerId()]);
  if (!trip) notFound();
  if (!ownerId || ownerId !== trip.ownerId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold">这条路线不属于你</h1>
        <p className="text-sm text-zinc-500">创建路线后浏览器会记住你的身份，但换设备后无法编辑。</p>
        <Link href="/" className="rounded-full bg-emerald-600 px-6 py-2 text-white">
          回到首页
        </Link>
      </main>
    );
  }
  return <Editor trip={trip} />;
}
