"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, Mail, Star, X } from "lucide-react";
import type { PublicTrip } from "@roam/core";
import { requestSignIn, verifySignIn, type AuthStatus } from "@/lib/auth-client";
import { useDismissOnEscape } from "@/hooks/useDismissOnEscape";

const GREEN = "#0E7A5C";
const INK = "#1D211D";
const MUTED = "#6E6D64";

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
        className="flex h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-gold/60 bg-gold-soft px-4 text-sm font-semibold text-amber shadow-sm transition-interact hover:shadow-card active:scale-[0.98]"
      >
        <Star size={15} fill="currentColor" aria-hidden />
        已收藏 · 打开
      </a>
    );
  }

  return (
    <>
      <button
        onClick={doSave}
        disabled={busy}
        className="flex h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-semibold text-brand shadow-sm transition-interact hover:shadow-card active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
        style={{ borderColor: "#D9D2C2", background: "#FFFFFF" }}
        title={auth.status === "authed" ? "收藏到我的行程" : "登录后收藏"}
      >
        {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <Star size={15} aria-hidden />}
        {saving ? "保存中…" : "收藏"}
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
  useDismissOnEscape(true, onClose);

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

  return createPortal(
    <div
      className="anim-fade-in fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="登录"
    >
      <button className="absolute inset-0 cursor-pointer bg-ink/50 backdrop-blur-sm" aria-label="关闭" onClick={onClose} />
      <div className="anim-scale-in relative w-80 rounded-3xl border border-line bg-surface p-6 shadow-float-lg">
        <button
          className="absolute right-3 top-3 cursor-pointer rounded-full p-1.5 text-faint transition-interact hover:bg-surface-soft hover:text-ink"
          aria-label="关闭"
          onClick={onClose}
        >
          <X size={16} />
        </button>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          {step === "email" ? <Mail size={20} strokeWidth={1.75} aria-hidden /> : <KeyRound size={20} strokeWidth={1.75} aria-hidden />}
        </span>
        <h3 className="mt-3 text-base font-semibold" style={{ color: INK }}>
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
              className="mt-4 h-11 w-full rounded-xl border bg-transparent px-3.5 text-sm outline-none transition-interact focus:ring-4 focus:ring-brand/15"
              style={{ borderColor: error ? "#C24B3F" : "#D9D2C2", color: INK }}
            />
            {error && <p className="mt-2 text-xs text-danger">{error}</p>}
            <button
              onClick={sendCode}
              disabled={busy}
              className="mt-4 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-semibold text-white transition-interact hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
              style={{ background: GREEN }}
            >
              {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
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
              className="mt-4 h-11 w-full rounded-xl border bg-transparent px-3 text-center text-lg tracking-[0.5em] outline-none transition-interact focus:ring-4 focus:ring-brand/15"
              style={{ borderColor: error ? "#C24B3F" : "#D9D2C2", color: INK }}
            />
            {error && <p className="mt-2 text-xs text-danger">{error}</p>}
            <button
              onClick={sendCode}
              className="mt-2 cursor-pointer text-xs underline-offset-2 hover:underline"
              style={{ color: MUTED }}
            >
              重新发送
            </button>
            <button
              onClick={verify}
              disabled={busy}
              className="mt-4 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-semibold text-white transition-interact hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
              style={{ background: GREEN }}
            >
              {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
              {busy ? "登录中…" : "登录并收藏"}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}