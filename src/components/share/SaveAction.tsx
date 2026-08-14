"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicTrip } from "@/lib/types";
import { requestSignIn, verifySignIn, type AuthStatus } from "@/lib/auth-client";

/* 明信片色板（spec 2026-08-13 功能四） */
const GREEN = "#0D7A5F";
const GOLD = "#C9A86A";
const INK = "#23262B";
const MUTED = "#8A857A";
const AMBER = "#B45309";

export default function SaveAction({ trip, auth, savedTripId }: {
  trip: PublicTrip;
  auth: { status: AuthStatus; user?: { name?: string | null; email?: string | null } };
  savedTripId: string | null;
}) {
  const [saved, setSaved] = useState(savedTripId);
  const [saving, setSaving] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);

  // 登录态从 SSR 切到客户端后，以客户端查询为准（覆盖匿名 cookie 时的初值）
  useEffect(() => {
    if (auth.status !== "authed") return;
    let live = true;
    void (async () => {
      try {
        const res = await fetch(`/api/trips/share/${encodeURIComponent(trip.shareId)}`);
        if (res.ok) {
          const data = (await res.json()) as { savedTripId?: string | null };
          if (live) setSaved(data.savedTripId ?? null);
        }
      } catch {
        // 查询失败保持初值
      }
    })();
    return () => { live = false; };
  }, [auth.status, trip.shareId]);

  const doSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trip.title ?? undefined, data: trip.data, sourceShareId: trip.shareId }),
      });
      if (res.status === 401) {
        setLoginOpen(true);
        setPendingSave(true);
        return;
      }
      if (!res.ok) throw new Error("save_failed");
      const data = (await res.json()) as { id: string };
      setSaved(data.id);
      setPendingSave(false);
    } catch {
      // 保存失败静默（按钮可重试）
    } finally {
      setSaving(false);
    }
  }, [saving, trip.title, trip.data, trip.shareId]);

  if (auth.status === "unconfigured") return null;

  const busy = saving || auth.status === "loading";

  if (saved) {
    return (
      <a
        href={`/editor/${saved}`}
        className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors"
        style={{ borderColor: GOLD, background: "#FFF8E7", color: AMBER }}
      >
        ★ 已收藏 · 打开
      </a>
    );
  }

  return (
    <>
      <button
        onClick={doSave}
        disabled={busy}
        className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60"
        style={{ borderColor: "#DDD5C4", background: "#FFFFFF", color: GREEN }}
        title={auth.status === "authed" ? "收藏到我的行程" : "登录后收藏"}
      >
        {saving ? "保存中…" : "☆ 收藏"}
      </button>
      {loginOpen && (
        <LoginSheet
          onClose={() => { setLoginOpen(false); setPendingSave(false); }}
          onSuccess={async () => {
            // 登录成功：认领匿名行程，再继续未完成的收藏
            try {
              await fetch("/api/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
            } catch {
              // 认领失败不阻断收藏
            }
            setLoginOpen(false);
            if (pendingSave) {
              setPendingSave(false);
              await doSave();
            }
          }}
        />
      )}
    </>
  );
}

/** 邮箱验证码登录浮层（spec 3.4）：邮箱 → 验证码 → 登录。 */
function LoginSheet({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void | Promise<void> }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("请输入有效的邮箱地址");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestSignIn(value);
      setStep("code");
    } catch (e) {
      setError((e as Error).message === "auth_not_configured" ? "登录功能未配置" : "验证码发送失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (code.trim().length < 4) {
      setError("请输入验证码");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifySignIn(email.trim(), code);
      await onSuccess();
    } catch {
      setError("验证码不正确或已过期");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="登录">
      <button className="absolute inset-0 bg-black/40" aria-label="关闭" onClick={onClose} />
      <div className="relative w-80 rounded-2xl bg-white p-6 shadow-2xl">
        <button className="absolute right-3 top-3 text-sm text-zinc-400 hover:text-zinc-600" aria-label="关闭" onClick={onClose}>✕</button>
        <h3 className="text-base font-semibold" style={{ color: INK }}>
          {step === "email" ? "登录后收藏这条路线" : "输入验证码"}
        </h3>
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          {step === "email" ? "无需注册，验证码会发送到你的邮箱" : `验证码已发送至 ${email}`}
        </p>
        {step === "email" ? (
          <>
            <input
              type="email"
              inputMode="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendCode()}
              placeholder="you@example.com"
              className="mt-4 h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-600"
              style={{ borderColor: error ? "#DC2626" : "#DDD5C4" }}
            />
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <button
              onClick={sendCode}
              disabled={busy}
              className="mt-4 h-11 w-full rounded-full text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: GREEN }}
            >
              {busy ? "发送中…" : "发送验证码"}
            </button>
          </>
        ) : (
          <>
            <input
              inputMode="numeric"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && verify()}
              placeholder="6 位验证码"
              className="mt-4 h-11 w-full rounded-xl border px-3 text-center text-lg tracking-[0.5em] outline-none focus:border-emerald-600"
              style={{ borderColor: error ? "#DC2626" : "#DDD5C4" }}
            />
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <button
              onClick={sendCode}
              className="mt-2 text-xs underline-offset-2 hover:underline"
              style={{ color: MUTED }}
            >
              重新发送
            </button>
            <button
              onClick={verify}
              disabled={busy}
              className="mt-4 h-11 w-full rounded-full text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: GREEN }}
            >
              {busy ? "登录中…" : "登录并收藏"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}