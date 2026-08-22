"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import type { Trip } from "@roam/core";

/** 分享按钮：移动端优先系统分享面板，fallback 复制链接。 */
export default function ShareButton({ trip, variant = "solid" }: { trip: Trip; variant?: "solid" | "ghost" }) {
  const [copied, setCopied] = useState(false);

  const share = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // window 只能在点击时访问（SSR 渲染阶段不可用）
    const shareUrl = `${window.location.origin}/t/${trip.shareId}`;
    const nav = navigator as Navigator & { share?: (data: { url: string; title?: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: trip.title ?? "Roam 路线", url: shareUrl });
        return;
      } catch {
        // 用户取消分享面板：忽略
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert(`分享链接：${shareUrl}`);
    }
  };

  const base =
    "transition-interact inline-flex items-center gap-1.5 rounded-full text-sm font-medium select-none " +
    (variant === "solid"
      ? "bg-brand text-white shadow-sm hover:bg-brand-deep active:scale-95"
      : "border border-line text-muted hover:bg-surface-soft hover:text-ink");

  return (
    <button onClick={share} className={`${base} px-4 py-2`}>
      {copied ? <Check size={15} /> : <Share2 size={15} />}
      {copied ? "已复制" : "分享"}
    </button>
  );
}