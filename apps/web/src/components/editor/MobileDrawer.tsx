"use client";

import { useEffect, useMemo, useRef } from "react";
import { RotateCcw, RotateCw, TriangleAlert } from "lucide-react";
import type { TripData, TripStop } from "@roam/core";
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

const ROUNDED = "rounded-t-3xl";

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
        className={`${ROUNDED} bg-surface shadow-float-lg ring-1 ring-line/70 transition-transform duration-200 ease-out`}
        style={{ height: heightPx, transform: `translateY(${dragOffset}px)` }}
        data-testid="mobile-drawer"
      >
        <div
          data-testid="drawer-handle"
          className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-line-strong"
          style={{ touchAction: "none" }}
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

  const chip = (disabled: boolean, title: string, onClick: (() => void) | undefined, children: React.ReactNode) => (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className="flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-full border border-line px-2 text-muted transition-interact hover:bg-surface-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );

  return (
    <div className="flex shrink-0 items-center gap-1.5 px-3 text-xs">
      <SaveStatusChip status={status} />
      <span className="flex-1" />
      {chip(!canUndo, "撤销 (Ctrl+Z)", canUndo ? () => useTripStore.getState().undo() : undefined, <RotateCcw size={14} />)}
      {chip(!canRedo, "重做", canRedo ? () => useTripStore.getState().redo() : undefined, <RotateCw size={14} />)}
      {trip && <ShareButton trip={trip} variant="ghost" />}
    </div>
  );
}

function SaveStatusChip({ status }: { status: string }) {
  const text =
    status === "saved" ? "已保存" : status === "saving" ? "保存中…" : status === "error" ? "保存失败" : status === "dirty" ? "待保存…" : "";
  const dot =
    status === "saved"
      ? "bg-brand"
      : status === "saving"
        ? "animate-pulse bg-amber"
        : status === "dirty"
          ? "bg-line-strong"
          : "bg-danger";
  return (
    <span
      data-testid="save-status"
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 font-medium ${
        status === "saved"
          ? "border-brand/25 text-brand"
          : status === "error"
            ? "border-danger/30 bg-danger-soft text-danger"
            : "border-line text-muted"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {text || "—"}
      {status === "error" && (
        <button
          onClick={() => void useTripStore.getState().save()}
          className="ml-0.5 flex h-6 cursor-pointer items-center gap-1 rounded-full bg-danger px-2 text-[11px] font-medium text-white transition-interact hover:brightness-105"
        >
          <TriangleAlert size={11} aria-hidden />
          重试
        </button>
      )}
    </span>
  );
}