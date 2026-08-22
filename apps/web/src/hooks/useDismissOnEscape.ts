import { useEffect } from "react";

/** 弹窗打开期间按 Esc 调用 onClose（与 ConfirmDialog 行为一致）。 */
export function useDismissOnEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}