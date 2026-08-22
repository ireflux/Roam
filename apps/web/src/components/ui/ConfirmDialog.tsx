"use client";

import { useEffect } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 确认按钮使用破坏性红色样式（默认）。 */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 统一的二次确认弹层（替换 window.confirm）：
 * 破坏性操作默认聚焦「取消」，避免误触 Enter 直接删除；
 * 点击遮罩 / 取消 / 确认（或 Esc）关闭。Esc 语义等同取消。
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "删除",
  cancelText = "取消",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      className="anim-fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="presentation"
        className="anim-scale-in w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-float-lg"
      >
        <h3 className="text-base font-semibold">{title}</h3>
        {message && <p className="mt-2 text-sm leading-relaxed text-muted">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            autoFocus
            onClick={onCancel}
            className="transition-interact rounded-full border border-line px-4 py-2 text-sm text-ink hover:bg-surface-soft"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`transition-interact rounded-full px-4 py-2 text-sm font-medium text-white ${
              danger ? "bg-danger hover:bg-danger/90" : "bg-brand hover:bg-brand-deep"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}