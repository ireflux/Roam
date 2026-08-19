"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CircleAlert,
  Lock,
  LockOpen,
  MapPin,
  MousePointer2,
  PenLine,
  RotateCcw,
  RotateCw,
  Route,
  TriangleAlert,
} from "lucide-react";
import type { Mode, Position, Trip, TripStop } from "@/lib/types";
import { MODE_LABEL } from "@/lib/types";
import { MODE_ICON_COMPONENT } from "@/lib/modeIcons";
import { useTripStore, type Tool } from "@/lib/useTripStore";
import MapLayers from "@/components/editor/MapLayers";
import SearchBox from "@/components/editor/SearchBox";
import MobileDrawer from "@/components/editor/MobileDrawer";
import TripSidebarContent from "@/components/editor/TripSidebarContent";
import { useFreehandDraw } from "@/components/editor/useFreehandDraw";
import { useVertexSnap } from "@/components/editor/useVertexSnap";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useOnboarding } from "@/hooks/useOnboarding";
import TipBanner from "@/components/ui/TipBanner";
import WelcomeOverlay from "@/components/ui/WelcomeOverlay";
import ShareButton from "@/components/ui/ShareButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const TOOLS: { id: Tool; icon: typeof MapPin; label: string }[] = [
  { id: "select", icon: MousePointer2, label: "选择" },
  { id: "add", icon: MapPin, label: "添加" },
  { id: "draw", icon: PenLine, label: "绘制" },
  { id: "snap", icon: Route, label: "改线" },
];
const MODES: Mode[] = ["driving", "walking", "cycling", "transit"];

export default function Editor({ trip }: { trip: Trip }) {
  const router = useRouter();
  const storeTrip = useTripStore((s) => s.trip);
  const status = useTripStore((s) => s.status);
  const map = useTripStore((s) => s.map);
  const load = useTripStore((s) => s.load);
  const tool = useTripStore((s) => s.tool);
  const selectedSegId = useTripStore((s) => s.selectedSegId);
  const activeDayId = useTripStore((s) => s.activeDayId);
  const setActiveDayId = useTripStore((s) => s.setActiveDayId);
  const conflict = useTripStore((s) => s.conflict);
  const resolveConflict = useTripStore((s) => s.resolveConflict);

  const [searchFocused, setSearchFocused] = useState(false);
  const [toast, setToast] = useState<{ key: number; text: string; action?: { label: string; onActivate: () => void } } | null>(null);
  const mobile = useIsMobile();
  const onboarding = useOnboarding();

  useEffect(() => {
    load(trip);
  }, [trip, load]);

  // 关页/切后台前立即冲刷防抖保存，避免 1.5s 防抖窗口内的编辑丢失
  useEffect(() => {
    const flush = () => useTripStore.getState().flushNow();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const data = storeTrip?.data ?? trip.data;
  const dayId = activeDayId ?? data.days[0]?.id ?? "";
  const segState = useTripStore((s) => s.segState);
  const failedSegs = data.segments.filter((s) => segState[s.id] === "error");
  const selectedSeg = data.segments.find((s) => s.id === selectedSegId);
  const mapUnlocked = useTripStore((s) => s.mapUnlocked);
  const setMapUnlocked = useTripStore((s) => s.setMapUnlocked);
  const busyTool = tool === "draw" || tool === "snap";
  const dragLocked = busyTool && !mapUnlocked;

  const onDrawCommit = useCallback(
    (points: Position[]) => {
      const s = useTripStore.getState();
      s.completeFreehand(points);
      onboarding.markHintSeen("draw");
      setToast((t) => ({ key: (t?.key ?? 0) + 1, text: "已绘制一条路段" }));
    },
    [onboarding],
  );
  const onVertexMove = useCallback(
    (segId: string, idx: number, pos: Position, commit: boolean) => {
      useTripStore.getState().moveVertex(segId, idx, pos, commit);
      if (commit) onboarding.markHintSeen("snap");
    },
    [onboarding],
  );

  useFreehandDraw(map, tool === "draw", dragLocked, onDrawCommit);
  useVertexSnap(map, tool === "snap", data, selectedSegId, onVertexMove);

  const pickStop = useCallback((name: string, lng: number, lat: number) => {
    useTripStore.getState().addStopAt({ name, lng, lat });
  }, []);

  const locateStop = useCallback(
    (stop: TripStop) => {
      useTripStore.getState().selectStop(stop.id);
      if (!map || typeof map.setZoomAndCenter !== "function") return;
      map.setZoomAndCenter(Math.max(map.getZoom(), 15), [stop.lng, stop.lat]);
    },
    [map],
  );

  const onStopDeleted = useCallback((stop: TripStop) => {
    setToast({
      key: Date.now(),
      text: `已删除「${stop.name || "未命名地点"}」`,
      action: {
        label: "撤销",
        onActivate: () => {
          if (useTripStore.getState().undoDelete()) setToast(null);
        },
      },
    });
  }, []);

  return (
    <div className="h-screen w-full overflow-hidden">
      <div className="relative h-full w-full">
        <MapView className="absolute inset-0" onLoad={(m) => useTripStore.getState().setMap(m)} />
        <MapLayers map={map} dragLocked={dragLocked} />

        {/* 工具行 */}
        <Toolbar
          trip={storeTrip ?? trip}
          status={status}
          mobile={mobile}
          failedSegs={failedSegs}
          onBack={() => router.push("/")}
          searchFocused={searchFocused}
          onSearchFocus={setSearchFocused}
          onPick={pickStop}
        />

        {/* 绘制/改线锁定提示 */}
        {busyTool && (
          <LockChip
            locked={dragLocked}
            floatingLeft={!mobile}
            onToggle={() => setMapUnlocked(mapUnlocked ? false : true)}
            tool={tool}
            top={mobile ? 118 : 72}
          />
        )}

        {/* 情境引导提示 */}
        {tool === "draw" && !onboarding.seenHint("draw") && (
          <TipBanner text="按住地图开始绘制 · 松手完成" onClose={() => onboarding.markHintSeen("draw")} />
        )}
        {tool === "snap" && !onboarding.seenHint("snap") && (
          <TipBanner text="点击路线选中，再拖动紫色圆点调整" onClose={() => onboarding.markHintSeen("snap")} />
        )}
        {tool === "add" && data.stops.length === 0 && !onboarding.seenHint("add") && (
          <TipBanner text="点击地图添加第一个地点" onClose={() => onboarding.markHintSeen("add")} />
        )}
        {failedSegs.length > 0 && !onboarding.seenHint("degrade") && (
          <TipBanner text="部分路段无法规划，已降级为直线，可点击重试" position="top" onClose={() => onboarding.markHintSeen("degrade")} />
        )}

        {/* 选中段：切换出行方式 */}
        {selectedSeg && (
          <ModeSwitcher
            mode={selectedSeg.mode}
            segId={selectedSeg.id}
            mobile={mobile}
          />
        )}

        {/* 行程面板：桌面侧栏 / 移动抽屉 */}
        {mobile ? (
          <MobileDrawer
            data={data}
            activeDayId={dayId}
            onDayChange={setActiveDayId}
            onLocateStop={locateStop}
            onStopDeleted={onStopDeleted}
          />
        ) : (
          <aside className="absolute inset-y-0 right-0 z-10 w-full max-w-sm border-l border-line bg-surface shadow-[-12px_0_40px_rgb(0_0_0/0.04)]">
            <TripSidebarContent
              data={data}
              activeDayId={dayId}
              onDayChange={setActiveDayId}
              onLocateStop={locateStop}
              onStopDeleted={onStopDeleted}
            />
          </aside>
        )}

        {/* 操作反馈 toast（临时提示，自动消失） */}
        {toast && (
          <div
            className="pointer-events-none absolute inset-x-0 z-30"
            style={{ bottom: mobile ? "calc(42vh + 16px)" : 16, top: "auto" }}
          >
            <TipBanner
              key={toast.key}
              text={toast.text}
              actionText={toast.action?.label}
              onAction={toast.action ? () => toast.action!.onActivate() : undefined}
              autoHideMs={5000}
              onClose={() => setToast(null)}
            />
          </div>
        )}

        {/* 首次进入欢迎层 */}
        {!onboarding.l0Done && <WelcomeOverlay onDone={onboarding.finishL0} />}

        {/* 保存冲突：其他窗口/设备已修改，需选择保留哪个版本 */}
        {conflict && (
          <ConfirmDialog
            open
            title="内容已在其他窗口被修改"
            message="此路线已在其他窗口或设备上被编辑。选择保留哪个版本？"
            confirmText="以本地为准（覆盖）"
            cancelText="以服务器为准（放弃本地修改）"
            danger={false}
            onConfirm={() => void resolveConflict("local")}
            onCancel={() => void resolveConflict("server")}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------- 工具行 ------------------------------- */

interface ToolbarProps {
  trip: Trip;
  status: string;
  mobile: boolean;
  failedSegs: { id: string; fromStop: string; toStop: string }[];
  searchFocused: boolean;
  onSearchFocus: (v: boolean) => void;
  onPick: (name: string, lng: number, lat: number) => void;
  onBack: () => void;
}

function Toolbar({ trip, status, mobile, failedSegs, searchFocused, onSearchFocus, onPick, onBack }: ToolbarProps) {
  if (mobile) {
    return (
      <div className="absolute left-3 right-3 top-3 z-20">
        {!searchFocused && (
          <div className="mb-2 flex items-center gap-2">
            <IconButton onClick={onBack} label="返回">
              <ArrowLeft size={18} />
            </IconButton>
            <ToolGroup mobile />
          </div>
        )}
        {searchFocused ? (
          <SearchRow autoFocus onBlur={() => onSearchFocus(false)} onFocusChange={onSearchFocus} onPick={onPick} />
        ) : (
          <SearchRow onFocusChange={onSearchFocus} onPick={onPick} />
        )}
      </div>
    );
  }

  return (
    <div className="absolute left-3 right-3 top-3 z-20 flex flex-wrap items-center gap-2 sm:left-4 sm:top-4 sm:right-[400px]">
      <IconButton onClick={onBack} label="返回">
        <ArrowLeft size={18} />
      </IconButton>
      <ToolGroup />
      <div className="min-w-[180px] flex-1 sm:max-w-xs">
        <SearchBox onPick={onPick} />
      </div>
      <UndoRedo />
      {status === "error" ? (
        <SaveErrorChip onClick={() => void useTripStore.getState().save()} />
      ) : (
        <StatusChip status={status} />
      )}
      {failedSegs.length > 0 && <FailedBadge count={failedSegs.length} segs={failedSegs} />}
      <ShareButton trip={trip} />
    </div>
  );
}

function SearchRow({ autoFocus, onBlur, onFocusChange, onPick }: { autoFocus?: boolean; onBlur?: () => void; onFocusChange?: (v: boolean) => void; onPick: (name: string, lng: number, lat: number) => void }) {
  const [focused, setFocused] = useState(false);
  const report = (v: boolean) => {
    setFocused(v);
    onFocusChange?.(v);
    if (!v) onBlur?.();
  };
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <SearchBox autoFocus={autoFocus} onPick={onPick} onFocusChange={report} />
      </div>
      {focused && (
        <button
          onClick={() => report(false)}
          className="shrink-0 rounded-full border border-line bg-surface px-3 py-2.5 text-sm text-muted shadow-sm transition-interact hover:text-ink"
        >
          完成
        </button>
      )}
    </div>
  );
}

/* ------------------------------- 小组件 ------------------------------- */

function IconButton({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-surface px-3 text-ink shadow-sm transition-interact hover:border-line-strong hover:shadow-float active:scale-95"
    >
      {children}
    </button>
  );
}

function ToolGroup({ mobile }: { mobile?: boolean }) {
  const tool = useTripStore((s) => s.tool);
  return (
    <div className="flex overflow-hidden rounded-full border border-line bg-surface p-1 shadow-sm">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const active = tool === t.id;
        return (
          <button
            key={t.id}
            title={t.label}
            aria-label={t.label}
            aria-pressed={active}
            onClick={() => useTripStore.getState().setTool(t.id)}
            className={`transition-interact inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full font-medium ${
              mobile ? "min-w-11 px-2.5 py-2" : "px-3 py-2 text-sm"
            } ${
              active
                ? "bg-brand text-white shadow-sm"
                : "text-muted hover:bg-brand-soft/70 hover:text-brand"
            }`}
          >
            <Icon size={16} strokeWidth={active ? 2.25 : 2} aria-hidden />
            {!mobile && <span>{t.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

function UndoRedo() {
  const canUndo = useTripStore((s) => s.canUndo);
  const canRedo = useTripStore((s) => s.canRedo);
  const btn = (title: string, disabled: boolean, onClick: () => void, children: React.ReactNode) => (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-muted transition-interact hover:bg-brand-soft/70 hover:text-brand disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted"
    >
      {children}
    </button>
  );
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-line bg-surface px-0.5 shadow-sm">
      {btn("撤销 (Ctrl+Z)", !canUndo, () => useTripStore.getState().undo(), <RotateCcw size={16} />)}
      {btn("重做", !canRedo, () => useTripStore.getState().redo(), <RotateCw size={16} />)}
    </div>
  );
}

/** 保存状态 chip：圆点 + 文案，颜色随状态切换。 */
function StatusChip({ status }: { status: string }) {
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
      className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-xs text-muted shadow-sm sm:flex"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {status === "saved" ? "已保存" : status === "saving" ? "保存中…" : status === "dirty" ? "待保存…" : status === "error" ? "保存失败" : ""}
    </span>
  );
}

function SaveErrorChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="hidden cursor-pointer items-center gap-1.5 rounded-full border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger shadow-sm transition-interact hover:bg-danger/10 sm:flex"
    >
      <TriangleAlert size={14} aria-hidden />
      保存失败 · 重试
    </button>
  );
}

function FailedBadge({ count, segs }: { count: number; segs: { id: string; fromStop: string; toStop: string }[] }) {
  const [open, setOpen] = useState(false);
  const data = useTripStore((s) => s.trip?.data) ?? { stops: [] as { id: string; name: string }[] };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-amber px-3 py-2 text-xs font-medium text-white shadow-sm transition-interact hover:brightness-105 active:scale-95"
      >
        <CircleAlert size={14} aria-hidden />
        {count} 段降级
      </button>
      {open && (
        <div className="anim-scale-in absolute right-0 top-11 z-30 w-72 origin-top-right rounded-2xl border border-line bg-surface p-2 shadow-float-lg">
          <p className="px-2 pb-1 pt-1 text-xs text-faint">规划失败降级为直线，可重试</p>
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {segs.map((seg) => {
              const from = data.stops.find((s) => s.id === seg.fromStop)?.name ?? "起点";
              const to = data.stops.find((s) => s.id === seg.toStop)?.name ?? "终点";
              return (
                <li key={seg.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-interact hover:bg-surface-soft">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{from} → {to}</span>
                  <button
                    onClick={() => useTripStore.getState().retrySegment(seg.id)}
                    className="shrink-0 cursor-pointer rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-white transition-interact hover:bg-brand-deep"
                  >
                    重试
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function LockChip({ locked, floatingLeft, onToggle, tool, top }: { locked: boolean; floatingLeft?: boolean; onToggle: () => void; tool: Tool; top: number }) {
  const LockIcon = locked ? Lock : LockOpen;
  return (
    <button
      onClick={onToggle}
      title={locked ? "地图已锁定：单指用于绘制/改线，双指缩放；点击解锁平移" : "地图平移已解锁，点击重新锁定"}
      className={`absolute z-30 flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-xs font-medium text-ink shadow-float transition-interact hover:shadow-float-lg ${
        floatingLeft ? "left-4" : "right-3"
      }`}
      style={{ top }}
    >
      <LockIcon size={13} className={locked ? "text-brand" : "text-muted"} aria-hidden />
      <span>{locked ? "已锁定" : "已解锁"}</span>
      <span className="hidden text-faint sm:inline">{tool === "draw" ? "绘制中" : "改线中"}</span>
    </button>
  );
}

function ModeSwitcher({ mode, segId, mobile }: { mode: Mode; segId: string; mobile: boolean }) {
  return (
    <div
      className={`anim-scale-in absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface/90 p-1 shadow-float-lg backdrop-blur-md ${
        mobile ? "bottom-[calc(42vh+16px)]" : "bottom-4"
      }`}
    >
      <span className="px-2 text-xs text-faint">方式</span>
      {MODES.map((m) => {
        const Icon = MODE_ICON_COMPONENT[m];
        const active = mode === m;
        return (
          <button
            key={m}
            title={MODE_LABEL[m]}
            aria-label={MODE_LABEL[m]}
            aria-pressed={active}
            onClick={() => useTripStore.getState().setMode(segId, m)}
            className={`transition-interact inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm ${
              active ? "bg-brand text-white shadow-sm" : "text-muted hover:bg-surface-soft hover:text-ink"
            }`}
          >
            <Icon size={15} strokeWidth={active ? 2.25 : 2} aria-hidden />
            <span className="hidden sm:inline">{MODE_LABEL[m]}</span>
          </button>
        );
      })}
    </div>
  );
}