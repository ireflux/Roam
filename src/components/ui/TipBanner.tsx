"use client";

import { useEffect, useState } from "react";

interface TipBannerProps {
  text: string;
  /** 位置：bottom 覆盖在地图底部（绘制提示），top 覆盖在搜索结果顶部（搜索提示）。 */
  position?: "bottom" | "top";
  /** 自动消失延迟 ms；0 表示不自动消失（需手动关闭）。 */
  autoHideMs?: number;
  onClose?: () => void;
}

/**
 * 统一的情境提示条（P1 L1/L2）。非阻塞：hover/click 在手，不拦截地图手势；
 * 自动消失 + 「知道了」可手动关闭。
 */
export default function TipBanner({ text, position = "bottom", autoHideMs = 3500, onClose }: TipBannerProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!visible || !autoHideMs) return;
    const timer = setTimeout(() => setVisible(false), autoHideMs);
    return () => clearTimeout(timer);
  }, [visible, autoHideMs]);

  useEffect(() => {
    if (!visible) onClose?.();
  }, [visible, onClose]);

  if (!visible) return null;

  const posCls =
    position === "bottom"
      ? "bottom-20 left-1/2 -translate-x-1/2"
      : "top-16 left-1/2 -translate-x-1/2";
  return (
    <div
      className={`pointer-events-auto absolute z-30 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-zinc-200 bg-zinc-900/95 px-4 py-2 text-sm text-zinc-100 shadow-lg dark:border-zinc-700 ${posCls}`}
    >
      <span className="min-w-0 truncate">{text}</span>
      <button
        onClick={() => setVisible(false)}
        className="shrink-0 rounded-full px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-100"
      >
        知道了
      </button>
    </div>
  );
}