"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Mode, Position, Trip, TripStop } from "@/lib/types";
import { MODE_ICON, MODE_LABEL } from "@/lib/types";
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

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: "select", icon: "☝️", label: "选择" },
  { id: "add", icon: "📍", label: "添加" },
  { id: "draw", icon: "✏️", label: "绘制" },
  { id: "snap", icon: "🔧", label: "改线" },
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

  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  const [trafficOn, setTrafficOn] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const mobile = useIsMobile();
  const onboarding = useOnboarding();

  useEffect(() => {
    load(trip);
  }, [trip, load]);

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
      s.completeFreehand(points, s.currentMode);
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
    useTripStore.getState().addStopAt({ name, lat, lng, mode: useTripStore.getState().currentMode });
  }, []);

  const locateStop = useCallback(
    (stop: TripStop) => {
      useTripStore.getState().selectStop(stop.id);
      if (!map || typeof map.setZoomAndCenter !== "function") return;
      map.setZoomAndCenter(Math.max(map.getZoom(), 15), [stop.lng, stop.lat]);
    },
    [map],
  );

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
          trafficOn={trafficOn}
          onTrafficToggle={() => setTrafficOn((v) => !v)}
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
            onToggle={() => setMapUnlocked(mapUnlocked ? false : true)}
            tool={tool}
            top={mobile ? 118 : 56}
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
          <div
            className={`absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 shadow-lg dark:bg-zinc-900 ${
              mobile ? "bottom-[calc(42vh+16px)]" : "bottom-4"
            }`}
          >
            <span className="text-sm text-zinc-600 dark:text-zinc-300">方式</span>
            {MODES.map((m) => (
              <button
                key={m}
                title={MODE_LABEL[m]}
                onClick={() => useTripStore.getState().setMode(selectedSeg.id, m)}
                className={`rounded-full px-2.5 py-1 text-sm ${selectedSeg.mode === m ? "bg-emerald-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
              >
                {MODE_ICON[m]} {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        )}

        {/* 行程面板：桌面侧栏 / 移动抽屉 */}
        {mobile ? (
          <MobileDrawer
            data={data}
            activeDayId={dayId}
            onDayChange={setActiveDayId}
            onLocateStop={locateStop}
            onStopDeleted={() => setToast({ key: Date.now(), text: "已删除，路线自动重连" })}
          />
        ) : (
          <aside className="absolute inset-y-0 right-0 z-10 w-full max-w-sm border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <TripSidebarContent
              data={data}
              activeDayId={dayId}
              onDayChange={setActiveDayId}
              onStopDeleted={() => setToast({ key: Date.now(), text: "已删除，路线自动重连" })}
            />
          </aside>
        )}

        {/* 操作反馈 toast（临时提示，自动消失） */}
        {toast && (
          <div
            className="pointer-events-none absolute inset-x-0 z-30"
            style={{ bottom: mobile ? "calc(42vh + 16px)" : 16, top: "auto" }}
          >
            <TipBanner key={toast.key} text={toast.text} onClose={() => setToast(null)} />
          </div>
        )}

        {/* 首次进入欢迎层 */}
        {!onboarding.l0Done && <WelcomeOverlay onDone={onboarding.finishL0} />}
      </div>
    </div>
  );
}

/* ------------------------------- 工具行 ------------------------------- */

interface ToolbarProps {
  trip: Trip;
  status: string;
  mobile: boolean;
  trafficOn: boolean;
  onTrafficToggle: () => void;
  failedSegs: { id: string; fromStop: string; toStop: string }[];
  searchFocused: boolean;
  onSearchFocus: (v: boolean) => void;
  onPick: (name: string, lng: number, lat: number) => void;
  onBack: () => void;
}

function Toolbar({ trip, status, mobile, trafficOn, onTrafficToggle, failedSegs, searchFocused, onSearchFocus, onPick, onBack }: ToolbarProps) {
  const tool = useTripStore((s) => s.tool);
  const currentMode = useTripStore((s) => s.currentMode);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);

  if (mobile) {
    return (
      <div className="absolute left-3 right-3 top-3 z-20">
        {!searchFocused && (
          <div className="mb-2 flex items-center gap-2">
            <IconButton onClick={onBack} label="返回">←</IconButton>
            <div className="flex overflow-hidden rounded-full bg-white shadow dark:bg-zinc-900">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  title={t.label}
                  onClick={() => useTripStore.getState().setTool(t.id)}
                  className={`min-w-11 px-3 py-2.5 text-base ${tool === t.id ? "bg-emerald-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                >
                  {t.icon}
                </button>
              ))}
            </div>
            <div className="relative">
              <button
                onClick={() => setModeMenuOpen((v) => !v)}
                title="默认交通方式"
                className="rounded-full bg-white px-3 py-2.5 text-base shadow hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                {MODE_ICON[currentMode]}
              </button>
              {modeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setModeMenuOpen(false)} />
                  <div className="absolute left-1/2 top-12 z-20 flex -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900">
                    {MODES.map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          useTripStore.getState().setCurrentMode(m);
                          setModeMenuOpen(false);
                        }}
                        className={`whitespace-nowrap px-4 py-2.5 text-left text-sm ${currentMode === m ? "bg-emerald-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                      >
                        {MODE_ICON[m]} {MODE_LABEL[m]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={onTrafficToggle}
              title="实时路况"
              className={`rounded-full px-3 py-2.5 text-base shadow ${trafficOn ? "bg-emerald-600 text-white" : "bg-white hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800"}`}
            >
              🚦
            </button>
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
    <div className="absolute left-3 right-3 top-3 z-20 flex flex-wrap items-center gap-2 sm:left-4 sm:top-4">
      <IconButton onClick={onBack} label="返回">←</IconButton>
      <div className="flex overflow-hidden rounded-full bg-white shadow dark:bg-zinc-900">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            title={t.label}
            onClick={() => useTripStore.getState().setTool(t.id)}
            className={`min-w-11 px-3 py-2 text-sm ${tool === t.id ? "bg-emerald-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
          >
            {t.icon}
          </button>
        ))}
        <div className="my-1.5 w-px bg-zinc-200 dark:bg-zinc-700" />
        {MODES.map((m) => (
          <button
            key={m}
            title={MODE_LABEL[m]}
            onClick={() => useTripStore.getState().setCurrentMode(m)}
            className={`px-3 py-2 text-sm ${currentMode === m ? "bg-emerald-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
          >
            {MODE_ICON[m]}
          </button>
        ))}
        <button
          title="实时路况"
          onClick={onTrafficToggle}
          className={`px-3 py-2 text-sm ${trafficOn ? "bg-emerald-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
        >
          🚦
        </button>
      </div>
      <div className="min-w-[180px] flex-1 sm:max-w-xs">
        <SearchBox onPick={onPick} />
      </div>
      <UndoRedo />
      {status === "error" ? (
        <button
          onClick={() => void useTripStore.getState().save()}
          className="ml-auto hidden rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 shadow sm:block dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
        >
          ⚠ 保存失败 · 重试
        </button>
      ) : (
        <span className="ml-auto hidden rounded-full bg-white px-3 py-2 text-xs text-zinc-500 shadow sm:block dark:bg-zinc-900">
          {status}
        </span>
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
          className="shrink-0 rounded-full bg-white px-3 py-2 text-sm text-zinc-600 shadow dark:bg-zinc-900 dark:text-zinc-300"
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
      className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-white px-3 text-sm shadow hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}

function UndoRedo() {
  const canUndo = useTripStore((s) => s.canUndo);
  const canRedo = useTripStore((s) => s.canRedo);
  return (
    <div className="flex overflow-hidden rounded-full bg-white shadow dark:bg-zinc-900">
      <button
        title="撤销 (Ctrl+Z)"
        onClick={() => useTripStore.getState().undo()}
        disabled={!canUndo}
        className="px-3 py-2 text-sm disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        ↩
      </button>
      <button
        title="重做"
        onClick={() => useTripStore.getState().redo()}
        disabled={!canRedo}
        className="px-3 py-2 text-sm disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        ↪
      </button>
    </div>
  );
}

function FailedBadge({ count, segs }: { count: number; segs: { id: string; fromStop: string; toStop: string }[] }) {
  const [open, setOpen] = useState(false);
  const data = useTripStore((s) => s.trip?.data) ?? { stops: [] as { id: string; name: string }[] };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-amber-500 px-3 py-2 text-sm font-medium text-white shadow hover:bg-amber-600"
      >
        ⚠ {count} 段降级
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-64 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <p className="px-2 pb-1 pt-1 text-xs text-zinc-400">规划失败降级为直线，可重试</p>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {segs.map((seg) => {
              const from = data.stops.find((s) => s.id === seg.fromStop)?.name ?? "起点";
              const to = data.stops.find((s) => s.id === seg.toStop)?.name ?? "终点";
              return (
                <li key={seg.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-600 dark:text-zinc-300">{from} → {to}</span>
                  <button
                    onClick={() => useTripStore.getState().retrySegment(seg.id)}
                    className="shrink-0 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs text-white hover:bg-emerald-700"
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

function LockChip({ locked, onToggle, tool, top }: { locked: boolean; onToggle: () => void; tool: Tool; top: number }) {
  return (
    <button
      onClick={onToggle}
      title={locked ? "地图已锁定：单指用于绘制/改线，双指缩放；点击解锁平移" : "地图平移已解锁，点击重新锁定"}
      className={`absolute right-3 z-30 flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-medium shadow dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200`}
      style={{ top }}
    >
      {locked ? "🔒 已锁定" : "🔓 已解锁"}
      <span className="hidden text-zinc-400 sm:inline">{tool === "draw" ? "绘制中" : "改线中"}</span>
    </button>
  );
}
