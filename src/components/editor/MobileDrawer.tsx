"use client";

import { useEffect, useMemo, useRef } from "react";
import type { TripData, TripStop } from "@/lib/types";
import { useTripStore } from "@/lib/useTripStore";
import { useDrawer, LEVEL_HEIGHT } from "@/hooks/useDrawer";
import TripSidebarContent from "@/components/editor/TripSidebarContent";
import ShareButton from "@/components/ui/ShareButton";

interface MobileDrawerProps {
  data: TripData;
  activeDayId: string | null;
  onDayChange: (dayId: string) => void;
  onLocateStop: (stop: TripStop) => void;
  onStopDeleted?: (stop: TripStop) => void;
}

const ROUNDED = "rounded-t-2xl";

/**
 * 移动端底部行程抽屉：
 * - 两级档位（half 42% / full 92%）+ 手势拖拽，拖动柄 + 标题行可下拖收起
 * - 绘制/改线工具激活时自动收起，离开自动恢复
 * - 头部行：保存状态 / 撤销 / 重做 / 分享（map 分级原则：地图工具行不含撤销）
 */
export default function MobileDrawer({ data, activeDayId, onDayChange, onLocateStop, onStopDeleted }: MobileDrawerProps) {
  const tool = useTripStore((s) => s.tool);
  const drawer = useDrawer("half");
  const { level, dragOffset } = drawer;

  // 绘制/改线时自动收起；离开时恢复原档位（用户主动收起不会被误恢复）
  const autoHiddenRef = useRef(false);
  useEffect(() => {
    const busy = tool === "draw" || tool === "snap";
    if (busy && drawer.level !== "collapsed") {
      autoHiddenRef.current = true;
      drawer.collapse();
    } else if (!busy && autoHiddenRef.current && drawer.level === "collapsed") {
      autoHiddenRef.current = false;
      drawer.restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, drawer.level]);

  const heightPx = useMemo(() => {
    if (level === "collapsed") return 0;
    return typeof window === "undefined" ? 0 : Math.round(window.innerHeight * LEVEL_HEIGHT[level]);
  }, [level]);

  const busy = tool === "draw" || tool === "snap";

  return (
    <div className={`absolute inset-x-0 bottom-0 z-20 ${busy ? "pointer-events-none" : ""}`}>
      <div
        className={`${ROUNDED} bg-white shadow-2xl transition-transform duration-200 ease-out dark:bg-zinc-950`}
        style={{ height: heightPx, transform: `translateY(${dragOffset}px)` }}
        data-testid="mobile-drawer"
      >
        <div
          data-testid="drawer-handle"
          className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-700"
          style={{ marginTop: 8, touchAction: "none" }}
          onPointerDown={(e) => {
            drawer.dragStart(e.clientY);
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => drawer.dragMove(e.clientY)}
          onPointerUp={(e) => drawer.dragEnd(e.clientY)}
          onPointerCancel={(e) => drawer.dragEnd(e.clientY)}
        />
        <div className="flex min-h-0 flex-col" style={{ marginTop: 8 }}>
          <DrawerHeader />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <TripSidebarContent
              data={data}
              activeDayId={activeDayId}
              onDayChange={onDayChange}
              mobile
              onLocateStop={onLocateStop}
              onStopDeleted={onStopDeleted}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DrawerHeader() {
  const status = useTripStore((s) => s.status);
  const canUndo = useTripStore((s) => s.canUndo);
  const canRedo = useTripStore((s) => s.canRedo);
  const trip = useTripStore((s) => s.trip);

  const chip = (children: React.ReactNode, title: string, onClick: (() => void) | undefined) => (
    <button
      onClick={onClick}
      title={title}
      className="flex h-8 min-w-8 items-center justify-center rounded-full border border-zinc-200 px-2 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );

  return (
    <div className="flex shrink-0 items-center gap-1.5 px-3 text-xs">
      <SaveStatusChip status={status} />
      <span className="flex-1" />
      {chip("↩", "撤销 (Ctrl+Z)", canUndo ? () => useTripStore.getState().undo() : undefined)}
      {chip("↪", "重做", canRedo ? () => useTripStore.getState().redo() : undefined)}
      {trip && <ShareButton trip={trip} variant="ghost" />}
    </div>
  );
}

function SaveStatusChip({ status }: { status: string }) {
  const text =
    status === "saved" ? "已保存 ✓" : status === "saving" ? "保存中…" : status === "error" ? "保存失败" : status === "dirty" ? "待保存…" : "";
  return (
    <span
      data-testid="save-status"
      className={`inline-flex h-8 items-center rounded-full border px-2 font-medium ${
        status === "saved"
          ? "border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400"
          : status === "error"
            ? "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950"
            : "border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
      }`}
    >
      {text || "—"}
      {status === "error" && (
        <button
          onClick={() => void useTripStore.getState().save()}
          className="ml-1 flex h-6 items-center rounded-full bg-amber-500 px-2 text-[11px] font-medium text-white hover:bg-amber-600"
        >
          重试
        </button>
      )}
    </span>
  );
}