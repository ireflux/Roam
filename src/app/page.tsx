"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Trip } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [recent, setRecent] = useState<Trip[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/recent")
      .then((r) => r.json())
      .then((d) => setRecent(d.trips ?? []))
      .catch(() => {});
  }, []);

  async function createTrip() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("创建失败");
      const { id } = await res.json();
      router.push(`/editor/${id}`);
    } catch {
      alert("创建失败，请重试");
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Roam 路线图</h1>
        <span className="text-sm text-zinc-500">旅行路线规划</span>
      </header>

      <section className="mt-16 text-center">
        <p className="text-4xl">🗺️</p>
        <h2 className="mt-4 text-3xl font-bold">
          规划你的下一段旅程
        </h2>
        <p className="mx-auto mt-3 max-w-md text-zinc-600 dark:text-zinc-400">
          添加地点自动生成路线，也可以自由绘制、拖拽吸附、逐段切换出行方式。
          多日行程一键规划，短链接分享给朋友。
        </p>
        <button
          onClick={createTrip}
          disabled={creating}
          className="mt-8 rounded-full bg-emerald-600 px-8 py-3 font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {creating ? "创建中…" : "新建路线"}
        </button>
      </section>

      {recent.length > 0 && (
        <section className="mt-16">
          <h3 className="mb-4 text-lg font-semibold">最近的路线</h3>
          <ul className="space-y-3">
            {recent.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => router.push(`/editor/${t.id}`)}
                  className="flex w-full items-center justify-between rounded-xl border border-zinc-200 px-5 py-4 text-left transition hover:border-emerald-500 hover:shadow-sm dark:border-zinc-800"
                >
                  <div>
                    <div className="font-medium">{t.title || "未命名路线"}</div>
                    <div className="mt-0.5 text-sm text-zinc-500">
                      {t.data.stops.length} 个地点 · {t.data.segments.length} 段路线
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400">
                    {new Date(t.updatedAt).toLocaleDateString("zh-CN")}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
