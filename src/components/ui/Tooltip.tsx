"use client";

import { useState } from "react";

interface Props {
  label: string;
  children?: React.ReactNode;
}

const TOOLTIP_BASE = "rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";

/**
 * 轻量 tooltip：桌面 hover 显示，移动端长按（750ms）显示。
 * 无状态库依赖，纯内联。
 */
export default function Tooltip({ label, children }: Props) {
  const [show, setShow] = useState(false);
  if (!show) {
    return (
      <span
        className="inline-flex"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onTouchStart={() => setShow(true)}
        onTouchEnd={() => setShow(false)}
        {...(label ? { title: label } : {})}
      >
        {children}
      </span>
    );
  }
  return (
    <span className="relative inline-flex" onMouseLeave={() => setShow(false)} onMouseEnter={() => setShow(true)}>
      {children}
      <span className={`pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap ${TOOLTIP_BASE}`}>
        {label}
      </span>
    </span>
  );
}

/** 快捷方式注释：跟随 tooltip 尾部展示，仅桌面可见。 */
export function Shortcut({ value }: { value: string }) {
  return (
    <kbd className="ml-2 rounded border border-zinc-300 bg-zinc-100 px-1 font-mono text-[10px] text-zinc-500 dark:border-zinc-600 dark:bg-zinc-800">
      {value}
    </kbd>
  );
}