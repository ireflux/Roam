"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const GREEN = "#0E7A5C";

export function PairForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const valid = /^\d{6}$/.test(code);

  const submit = async () => {
    if (!valid || state === "submitting") return;
    setState("submitting");
    setMessage(null);
    try {
      const res = await fetch("/api/auth/device-pair/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setState("error");
        setMessage(
          json.error === "invalid_or_expired"
            ? "配对码无效或已过期，请在 App 中重新生成"
            : "绑定失败，请稍后重试",
        );
        return;
      }
      const json = (await res.json()) as { claimedTrips: number };
      setState("ok");
      setMessage(`绑定成功！已合并 ${json.claimedTrips} 个行程到本账号。`);
      router.refresh();
    } catch {
      setState("error");
      setMessage("网络错误，请稍后重试");
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <label className="text-xs font-medium text-zinc-500">6 位配对码</label>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder="······"
        className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-3 text-center font-mono text-2xl tracking-[0.6em] outline-none focus:border-[#0E7A5C]"
      />
      {message ? (
        <p className={`mt-3 text-sm ${state === "ok" ? "text-emerald-700" : "text-red-600"}`}>{message}</p>
      ) : null}
      <button
        type="button"
        disabled={!valid || state === "submitting"}
        onClick={() => void submit()}
        className="mt-4 w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-40"
        style={{ backgroundColor: GREEN }}
      >
        {state === "submitting" ? "绑定中…" : "确认绑定"}
      </button>
    </div>
  );
}
