"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, MapPin, Route, Trash2, UserRound } from "lucide-react";
import type { Trip } from "@/lib/types";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

export default function Home() {
  const router = useRouter();
  const [recent, setRecent] = useState<Trip[]>([]);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Trip | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
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

  // 预热历史路线的编辑器页：列表加载后即后台发起 RSC 请求，Neon compute 提前唤醒，
  // 避免点击后才冷启动（5-15s）。prefetch 失败静默，不影响页面。
  useEffect(() => {
    recent.forEach((t) => router.prefetch(`/editor/${t.id}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recent]);

  const notify = (text: string) => setToast({ key: Date.now(), text });

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
      notify("创建失败，请重试");
      setCreating(false);
    }
  }

  async function deleteTrip(id: string) {
    const res = await fetch(`/api/trips/${id}`, { method: "DELETE" });
    if (!res.ok) {
      notify("删除失败，请重试");
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
          .catch(() => notify("保存昵称失败"));
      }
    }
    setEditingNickname(false);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-10">
      {/* 顶栏：Wordmark + 昵称 */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="flex items-center gap-1.5">
            <h1 className="font-serif text-2xl font-bold tracking-[0.06em] text-brand">
              Roam
            </h1>
            <a
              href="https://github.com/ireflux/Roam"
              target="_blank"
              rel="noopener noreferrer"
              title="View on GitHub"
              aria-label="View on GitHub"
              className="cursor-pointer rounded-full p-2 text-faint transition-interact hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <GithubIcon size={14} />
            </a>
          </span>
          <span className="text-sm text-faint">路线图</span>
        </div>
        {editingNickname ? (
          <span className="flex items-center gap-2">
            <span className="flex h-8 items-center gap-1.5 rounded-full border border-brand/30 bg-surface px-3 text-muted">
              <UserRound size={13} />
              昵称
            </span>
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
              className="h-9 w-32 rounded-full border border-brand/40 bg-surface px-3 text-sm outline-none transition-interact focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
          </span>
        ) : (
          <button
            onClick={startNicknameEdit}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm text-muted shadow-sm transition-interact hover:border-brand/40 hover:text-brand"
            title="设置昵称（分享页署名）"
          >
            <UserRound size={14} aria-hidden />
            {nickname || "设置昵称"}
          </button>
        )}
      </header>

      {/* Hero：旅程轨迹签名 + 主标题 + CTA */}
      <section className="relative mt-20 text-center">
        <p className="anim-fade-up text-xs font-medium uppercase tracking-[0.35em] text-faint">
          Plan · Draw · Share
        </p>
        <h2 className="anim-fade-up mt-4 font-serif text-4xl font-semibold leading-tight tracking-tight sm:text-5xl" style={{ animationDelay: "60ms" }}>
          规划你的<span className="text-brand">下一段旅程</span>
        </h2>
        <p className="anim-fade-up mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-muted" style={{ animationDelay: "120ms" }}>
          添加地点自动生成路线，也可以自由绘制、拖拽调线、逐段切换出行方式。
          多日行程一键规划，短链接分享给朋友。
        </p>
        <div className="anim-fade-up mt-8 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "180ms" }}>
          <button
            onClick={createTrip}
            disabled={creating}
            className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-full bg-ink px-8 text-sm font-semibold text-paper shadow-float transition-interact hover:bg-ink/90 hover:shadow-float-lg active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
          >
            {creating ? "创建中…" : "新建路线"}
            {!creating && <ArrowRight size={16} aria-hidden />}
          </button>
          <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-xs text-faint sm:flex">
            <MapPin size={13} className="text-brand" aria-hidden />
            无需登录，即刻开始
          </span>
        </div>
        <JourneyHero className="anim-fade-up mx-auto mt-12 max-w-xl" />
      </section>

      {/* 最近的路线 */}
      {recent.length > 0 && (
        <section className="anim-fade-up mt-16 w-full" style={{ animationDelay: "240ms" }}>
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold tracking-wide text-faint">最近的路线</h3>
            <span className="h-px flex-1 bg-line" aria-hidden />
            <span className="text-xs text-faint">{recent.length} 条</span>
          </div>
          <ul className="mt-4 space-y-2.5">
            {recent.map((t) => (
              <li key={t.id}>
                <div className="group flex w-full cursor-pointer items-center justify-between rounded-2xl border border-line bg-surface px-5 py-3.5 shadow-card transition-all hover:-translate-y-px hover:border-brand/30 hover:shadow-float">
                  <div
                    className="flex min-w-0 items-center gap-4"
                    onClick={() => router.push(`/editor/${t.id}`)}
                    onMouseEnter={() => router.prefetch(`/editor/${t.id}`)}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                      <Route size={18} strokeWidth={1.75} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{t.title || "未命名路线"}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-faint">
                        <span>{t.data.stops.length} 个地点</span>
                        <span aria-hidden>·</span>
                        <span>{t.data.segments.length} 段路线</span>
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 flex shrink-0 items-center gap-3">
                    <span className="text-xs text-faint">
                      {new Date(t.updatedAt).toLocaleDateString("zh-CN")}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleting(t);
                      }}
                      title="删除这条路线"
                      aria-label={`删除 ${t.title || "未命名路线"}`}
                      className="cursor-pointer rounded-full p-2 text-faint opacity-0 transition-interact hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-auto pt-16 pb-4 text-center text-xs text-faint">
        Roam 路线图 — 在地图上规划，把旅程分享给朋友
      </footer>

      <ConfirmDialog
        open={deleting !== null}
        title="删除这条路线？"
        message={`确定永久删除「${deleting?.title || "未命名路线"}」？此操作不可恢复。`}
        onConfirm={() => {
          const id = deleting?.id;
          setDeleting(null);
          if (id) void deleteTrip(id);
        }}
        onCancel={() => setDeleting(null)}
      />

      {toast && (
        <div key={toast.key} role="status" className="anim-toast-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-ink px-4 py-2.5 text-sm text-[#ecebe2] shadow-float-lg">
          {toast.text}
        </div>
      )}
    </main>
  );
}

/** GitHub 官方 Octocat 标记（lucide 新版已移除品牌图标，故内联 SVG）。 */
function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

/** Hero 签名元素：一段正在「被规划」的旅程轨迹——虚线路线 + 带编号的途经点 + 金色终点。 */
function JourneyHero({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 480 120"
      fill="none"
      aria-hidden
    >
      {/* 起点 → 途经点 1 → 途经点 2 → 终点 */}
      <path
        d="M8 92 C 60 92, 70 52, 130 50 S 220 84 280 60 S 380 16 440 24"
        stroke="var(--line-strong)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="3 8"
      />
      <path
        d="M8 92 C 60 92, 70 52, 130 50 S 220 84 280 60 S 380 16 440 24"
        stroke="var(--brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="14 120"
        className="anim-route-dash"
        opacity="0.75"
      />
      {/* 起点 */}
      <circle cx="8" cy="92" r="7" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2" />
      <circle cx="8" cy="92" r="2.5" fill="var(--brand)" />
      {/* 途经点 1 */}
      <circle cx="130" cy="50" r="11" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2" />
      <text x="130" y="54.5" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--brand)">
        1
      </text>
      <circle cx="130" cy="50" r="14" fill="var(--brand)" opacity="0.12" />
      {/* 途经点 2 */}
      <circle cx="280" cy="60" r="11" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2" />
      <text x="280" y="64.5" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--brand)">
        2
      </text>
      {/* 终点：金色实心 */}
      <circle cx="440" cy="24" r="11" fill="var(--gold)" />
      <circle cx="440" cy="24" r="15" fill="var(--gold)" opacity="0.15" />
      {/* 右上角小字提示 */}
      <text x="440" y="52" textAnchor="middle" fontSize="10" letterSpacing="2" fill="var(--faint)">
        目的地
      </text>
    </svg>
  );
}