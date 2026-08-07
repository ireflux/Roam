"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Trip } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [recent, setRecent] = useState<Trip[]>([]);
  const [creating, setCreating] = useState(false);
  const [nickname, setNickname] = useState<string | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  // Enter/取消/提交由 finish 处理；blur 只在其他情况触发提交，避免重复保存
  const nicknameHandled = useRef(false);

  useEffect(() => {
    fetch("/api/recent")
      .then((r) => r.json())
      .then((d) => setRecent(d.trips ?? []))
      .catch(() => {});
    fetch("/api/nickname")
      .then((r) => r.json())
      .then((d) => setNickname(d.nickname ?? null))
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

  async function deleteTrip(id: string) {
    if (!window.confirm("确定永久删除这条路线？此操作不可恢复。")) return;
    const res = await fetch(`/api/trips/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("删除失败，请重试");
      return;
    }
    setRecent((list) => list.filter((t) => t.id !== id));
  }

  function startNicknameEdit() {
    nicknameHandled.current = false;
    setNicknameDraft(nickname ?? "");
    setEditingNickname(true);
  }

  function finishNickname(commit: boolean) {
    nicknameHandled.current = true;
    if (commit) {
      const name = nicknameDraft.trim().slice(0, 30);
      if (name) {
        void fetch("/api/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: name }),
        })
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then(() => setNickname(name))
          .catch(() => alert("保存昵称失败"));
      }
    }
    setEditingNickname(false);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Roam 路线图</h1>
        {editingNickname ? (
          <span className="flex items-center gap-2">
            <input
              autoFocus
              value={nicknameDraft}
              onChange={(e) => setNicknameDraft(e.target.value)}
              onBlur={() => {
                if (!nicknameHandled.current) finishNickname(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") finishNickname(true);
                if (e.key === "Escape") finishNickname(false);
              }}
              placeholder="昵称"
              maxLength={30}
              className="rounded-full border border-zinc-200 px-3 py-1 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </span>
        ) : (
          <button
            onClick={startNicknameEdit}
            className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-500 hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-800"
            title="设置昵称（分享页署名）"
          >
            {nickname ? nickname : "设置昵称"}
          </button>
        )}
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
                <div className="group flex w-full cursor-pointer items-center justify-between rounded-xl border border-zinc-200 px-5 py-4 text-left transition hover:border-emerald-500 hover:shadow-sm dark:border-zinc-800">
                  <div className="min-w-0 flex-1" onClick={() => router.push(`/editor/${t.id}`)}>
                    <div className="font-medium">{t.title || "未命名路线"}</div>
                    <div className="mt-0.5 text-sm text-zinc-500">
                      {t.data.stops.length} 个地点 · {t.data.segments.length} 段路线
                    </div>
                  </div>
                  <div className="ml-4 flex items-center gap-3">
                    <span className="text-xs text-zinc-400">
                      {new Date(t.updatedAt).toLocaleDateString("zh-CN")}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteTrip(t.id);
                      }}
                      title="删除这条路线"
                      className="rounded-full p-2 text-zinc-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-950"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
