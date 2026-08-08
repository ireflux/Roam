"use client";

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
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        {message && <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            autoFocus
            onClick={onCancel}
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-full px-4 py-2 text-sm font-medium text-white transition ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}