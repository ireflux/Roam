"use client";

import { useCallback, useRef, useState } from "react";

const LONG_PRESS_MS = 400;
const SCROLL_SLOP_PX = 12;

export interface ReorderHover {
  index: number;
  /** viewport 坐标系中的插入线位置（组件层再换算为局部坐标）。 */
  top: number;
}

interface Session {
  pointerId: number;
  index: number;
  startY: number;
  el: HTMLElement | null;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * 移动端拖拽排序（pointer 事件，touch 专用；mouse 走桌面 HTML5 DnD，互不干扰）。
 *
 * 两种激活方式：
 * - `immediate`（拖拽手柄）：pointerdown 即进入拖拽，手柄元素 touch-action:none，
 *   不与列表滚动冲突。
 * - 长按（天数 chip 等无手柄的小 chip）：按住 400ms 且位移 <12px 激活；
 *   长按前手指移动视为滚动意图，取消。
 *
 * 拖拽中：卡片随手指 translateY，插入槽位由 elementFromPoint + 目标 rect 计算
 * （viewport 坐标，消费方换算局部坐标），以「最终插入位置下标」语义提交
 * （与 store.reorder(from, to) 一致）。
 */
export function useTouchReorder<T>(
  items: ReadonlyArray<T>,
  onCommit: (from: number, to: number) => void,
  /** 插入线定位坐标系的容器 ref（默认 viewport 坐标） */
  containerRef?: React.RefObject<HTMLUListElement | null>,
) {
  const [dragging, setDragging] = useState(false);
  const [from, setFrom] = useState<number | null>(null);
  const [hover, setHover] = useState<ReorderHover | null>(null);
  const [deltaY, setDeltaY] = useState(0);
  const sessionRef = useRef<Session | null>(null);

  const cancel = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return;
    if (cur.timer) clearTimeout(cur.timer);
    if (cur.el) cur.el.style.touchAction = "";
    sessionRef.current = null;
    setDragging(false);
    setFrom(null);
    setHover(null);
    setDeltaY(0);
  }, []);

  const activate = useCallback((cur: Session) => {
    setDragging(true);
    setFrom(cur.index);
    setHover({ index: cur.index, top: cur.el!.getBoundingClientRect().top });
    setDeltaY(0);
    if (cur.el) {
      cur.el.style.touchAction = "none";
      try {
        cur.el.setPointerCapture(cur.pointerId);
      } catch {
        // 指针可能已抬起
      }
    }
    navigator.vibrate?.(10);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, index: number, opts: { immediate?: boolean } = {}) => {
      if (e.pointerType === "mouse") return;
      const el = e.currentTarget as HTMLElement;
      const cur: Session = { pointerId: e.pointerId, index, startY: e.clientY, el, timer: null };
      sessionRef.current = cur;
      if (opts.immediate) {
        activate(cur);
        return;
      }
      cur.timer = setTimeout(() => {
        if (sessionRef.current === cur) activate(cur);
      }, LONG_PRESS_MS);
    },
    [activate],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const cur = sessionRef.current;
      if (!cur) return;
      if (!dragging) {
        // 长按前手指移动（滚动意图）→ 取消
        if (Math.abs(e.clientY - cur.startY) > SCROLL_SLOP_PX) cancel();
        return;
      }
      cur.el!.style.touchAction = "none";
      cur.el!.setPointerCapture?.(cur.pointerId);
      setDeltaY(e.clientY - cur.startY);
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const target = hit?.closest?.("[data-reorder-index]") as HTMLElement | null;
      if (!target) return;
      const index = Number(target.getAttribute("data-reorder-index"));
      if (Number.isNaN(index) || index === cur.index) {
        setHover(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      const base = containerRef?.current?.getBoundingClientRect().top ?? 0;
      const y = e.clientY < rect.top + rect.height / 2 ? rect.top : rect.bottom;
      setHover({ index, top: y - base });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragging, cancel],
  );

  const onPointerUp = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return;
    if (cur.timer) clearTimeout(cur.timer);
    if (cur.el) cur.el.style.touchAction = "";
    if (dragging && hover && hover.index !== cur.index) {
      onCommit(cur.index, hover.index);
    }
    sessionRef.current = null;
    setDragging(false);
    setFrom(null);
    setHover(null);
    setDeltaY(0);
  }, [dragging, hover, onCommit]);

  const onPointerCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  return { dragging, from, hover, deltaY, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}