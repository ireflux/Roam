"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/** 抽屉显示档位：collapsed 完全收起、half 半屏、full 全屏编辑。 */
export type DrawerLevel = "collapsed" | "half" | "full";

/** 各显示档位占屏高的比例（collapsed 由 transform 完全移出，无需比例）。 */
export const LEVEL_HEIGHT: Record<Exclude<DrawerLevel, "collapsed">, number> = {
  half: 0.42,
  full: 0.92,
};

const DRAG_THRESHOLD_PX = 64;

interface DragState {
  startY: number;
  fromLevel: DrawerLevel;
}

/**
 * 底部抽屉状态机：collapsed / half / full 三档 + 手势拖拽。
 *
 * - 手势：拖拽位移超过 DRAG_THRESHOLD_PX 才换档，否则回弹到原档位。
 *   自 half 上拖 → full；half 下拉 → collapsed；full 下拉 → half；
 *   collapsed 上拉 → full。
 * - 绘制/改线工具激活时 UI 层调用 collapse() 收起，restore() 恢复原档位。
 *
 * 拖拽过程中暴露 dragOffset（同手势累计位移，px，向下为正），组件用它实时
 * 跟随手指；手势结束时置 0 并按档位回弹。
 */
export function useDrawer(initial: DrawerLevel = "half") {
  const [level, setLevel] = useState<DrawerLevel>(initial);
  const levelRef = useRef<DrawerLevel>(initial);
  const prevRef = useRef<DrawerLevel>(initial);
  const dragRef = useRef<DragState | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const applyLevel = useCallback((next: DrawerLevel) => {
    if (next === "collapsed" && levelRef.current !== "collapsed") {
      prevRef.current = levelRef.current;
    }
    levelRef.current = next;
    setLevel(next);
  }, []);

  const collapse = useCallback(() => applyLevel("collapsed"), [applyLevel]);
  const restore = useCallback(() => {
    applyLevel(prevRef.current === "collapsed" ? "half" : prevRef.current);
  }, [applyLevel]);
  const toggleFull = useCallback(() => {
    applyLevel(levelRef.current === "full" ? "half" : "full");
  }, [applyLevel]);

  const dragStart = useCallback((clientY: number) => {
    dragRef.current = { startY: clientY, fromLevel: levelRef.current };
  }, []);

  const dragMove = useCallback((clientY: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    setDragOffset(clientY - drag.startY);
  }, []);

  const dragEnd = useCallback((clientY: number) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragOffset(0);
    if (!drag) return;
    const delta = clientY - drag.startY;
    const from = drag.fromLevel;
    if (delta < -DRAG_THRESHOLD_PX) {
      applyLevel(from === "full" ? "full" : "full");
    } else if (delta > DRAG_THRESHOLD_PX) {
      applyLevel(from === "half" ? "collapsed" : from === "full" ? "half" : from);
    }
    // 未过阈值：回弹，档位不变
  }, [applyLevel]);

  return useMemo(
    () => ({ level, dragOffset, collapse, restore, toggleFull, dragStart, dragMove, dragEnd }),
    [level, dragOffset, collapse, restore, toggleFull, dragStart, dragMove, dragEnd],
  );
}

export type DrawerState = ReturnType<typeof useDrawer>;