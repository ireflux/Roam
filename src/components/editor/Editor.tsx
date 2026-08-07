"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Mode, Position, Trip } from "@/lib/types";
import { MODE_ICON, MODE_LABEL } from "@/lib/types";
import type { AmapOverlay } from "@/lib/mapTypes";
import { useTripStore, type Tool } from "@/lib/useTripStore";
import MapLayers from "@/components/editor/MapLayers";
import SearchBox from "@/components/editor/SearchBox";
import { useFreehandDraw } from "@/components/editor/useFreehandDraw";
import { useVertexSnap } from "@/components/editor/useVertexSnap";
import { useDayWeather, WeatherBadge } from "@/components/weather/useDayWeather";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "选择" },
  { id: "add", label: "添加" },
  { id: "draw", label: "绘制" },
  { id: "snap", label: "改线" },
];

export default function Editor({ trip }: { trip: Trip }) {
  const router = useRouter();
  const storeTrip = useTripStore((s) => s.trip);
  const status = useTripStore((s) => s.status);
  const tool = useTripStore((s) => s.tool);
  const currentMode = useTripStore((s) => s.currentMode);
  const selectedSegId = useTripStore((s) => s.selectedSegId);
  const map = useTripStore((s) => s.map);
  const load = useTripStore((s) => s.load);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [failedOpen, setFailedOpen] = useState(false);
  const canUndo = useTripStore((s) => s.canUndo);
  const canRedo = useTripStore((s) => s.canRedo);
  const [trafficOn, setTrafficOn] = useState(false);
  const trafficRef = useRef<AmapOverlay | null>(null);

  useEffect(() => {
    if (!trafficOn) {
      if (trafficRef.current) {
        map?.remove(trafficRef.current);
        trafficRef.current = null;
      }
      return;
    }
    if (!map) return;
    const amap = window.AMap;
    if (!amap?.TileLayer || trafficRef.current) return;
    const layer = new amap.TileLayer.Traffic({ autoRefresh: true, interval: 180 });
    map.add(layer);
    trafficRef.current = layer;
    return () => {
      try {
        map?.remove(trafficRef.current as AmapOverlay);
      } catch {
        // map 可能已销毁
      }
      trafficRef.current = null;
    };
  }, [trafficOn, map]);

  useEffect(() => {
    load(trip);
  }, [trip, load]);

  const data = storeTrip?.data ?? trip.data;
  const dayWeather = useDayWeather(data.stops);
  const dayId = activeDayId ?? data.days[0]?.id ?? "";
  const stops = data.stops
    .filter((s) => s.dayId === dayId)
    .sort((a, b) => a.order - b.order);
  const selectedSeg = data.segments.find((s) => s.id === selectedSegId);
  const segState = useTripStore((s) => s.segState);
  const failedSegs = data.segments.filter((s) => segState[s.id] === "error");

  function pickStop(name: string, lng: number, lat: number) {
    useTripStore.getState().addStopAt({ name, lat, lng, mode: currentMode });
  }

  const deleteTrip = () => {
    if (!window.confirm("确定永久删除这条路线？此操作不可恢复。")) return;
    void fetch(`/api/trips/${storeTrip?.id ?? trip.id}`, { method: "DELETE" }).then((r) => {
      if (r.ok) router.push("/");
      else alert("删除失败，请重试");
    });
  };

  const onDrawCommit = (points: Position[]) => {
    useTripStore.getState().completeFreehand(points, currentMode);
  };
  const onVertexMove = (segId: string, idx: number, pos: Position, commit: boolean) => {
    useTripStore.getState().moveVertex(segId, idx, pos, commit);
  };
  useFreehandDraw(map, tool === "draw", onDrawCommit);
  useVertexSnap(map, tool === "snap", data, selectedSegId, onVertexMove);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="relative h-full flex-1 min-h-0">
        <MapView
          className="absolute inset-0"
          onLoad={(map) => useTripStore.getState().setMap(map)}
        />
        <MapLayers map={map} />

        {/* 顶部工具条 */}
        <div className="absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center gap-2 sm:left-4 sm:top-4">
          <button
            onClick={() => router.push("/")}
            className="rounded-full bg-white px-3 py-2 text-sm font-medium shadow hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            ←
          </button>
          <div className="flex overflow-hidden rounded-full bg-white shadow dark:bg-zinc-900">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                onClick={() => useTripStore.getState().setTool(t.id)}
                className={`px-3 py-2 text-sm ${tool === t.id ? "bg-emerald-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-full bg-white shadow dark:bg-zinc-900">
            {(["driving", "walking", "cycling", "transit"] as Mode[]).map((m) => (
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
              onClick={() => setTrafficOn((v) => !v)}
              title="实时路况（拥堵段会在驾车模式下标红/黄）"
              className={`px-3 py-2 text-sm ${trafficOn ? "bg-emerald-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
            >
              🚦
            </button>
          </div>
          <div className="min-w-[180px] flex-1 sm:max-w-xs">
            <SearchBox onPick={pickStop} />
          </div>
          <div className="flex overflow-hidden rounded-full bg-white shadow dark:bg-zinc-900">
            <button
              onClick={() => useTripStore.getState().undo()}
              disabled={!canUndo}
              title="撤销 (Ctrl+Z)"
              className="px-3 py-2 text-sm disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ↩
            </button>
            <button
              onClick={() => useTripStore.getState().redo()}
              disabled={!canRedo}
              title="重做"
              className="px-3 py-2 text-sm disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ↪
            </button>
          </div>
          <span className="ml-auto hidden rounded-full bg-white px-3 py-2 text-xs text-zinc-500 shadow sm:block dark:bg-zinc-900">
            {status === "saved" ? "已保存 ✓" : status === "saving" ? "保存中…" : status === "error" ? "保存失败" : status === "dirty" ? "待保存…" : ""}
          </span>
          {failedSegs.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setFailedOpen((v) => !v)}
                className="rounded-full bg-amber-500 px-3 py-2 text-sm font-medium text-white shadow hover:bg-amber-600"
              >
                ⚠ {failedSegs.length} 段路线降级
              </button>
              {failedOpen && (
                <div className="absolute right-0 top-11 z-20 w-72 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                  <p className="px-2 pb-1 pt-1 text-xs text-zinc-400">路线规划失败，已降级为直线，可重试</p>
                  <ul className="max-h-56 space-y-1 overflow-y-auto">
                    {failedSegs.map((seg) => {
                      const fromName = data.stops.find((s) => s.id === seg.fromStop)?.name ?? "起点";
                      const toName = data.stops.find((s) => s.id === seg.toStop)?.name ?? "终点";
                      return (
                        <li key={seg.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                          <span className="min-w-0 flex-1 truncate text-sm text-zinc-600 dark:text-zinc-300">
                            {fromName} → {toName}
                          </span>
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
          )}
          <ShareButton trip={storeTrip ?? trip} />
        </div>

        {/* 选中段操作条 */}
        {selectedSeg && (
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 shadow-lg dark:bg-zinc-900">
            <span className="text-sm text-zinc-600 dark:text-zinc-300">本段出行方式</span>
            {(["driving", "walking", "cycling", "transit"] as Mode[]).map((m) => (
              <button
                key={m}
                title={MODE_LABEL[m]}
                onClick={() => useTripStore.getState().setMode(selectedSeg.id, m)}
                className={`rounded-full px-3 py-1 text-sm ${selectedSeg.mode === m ? "bg-emerald-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
              >
                {MODE_ICON[m]} {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 侧栏 */}
      <aside className="flex w-full max-w-sm flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <header className="border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-start gap-2">
            <input
              value={storeTrip?.title ?? trip.title ?? ""}
              onChange={(e) => useTripStore.getState().setTitle(e.target.value)}
              placeholder="路线标题"
              className="w-full flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-zinc-400"
            />
            <button
              onClick={deleteTrip}
              title="删除这条路线"
              className="rounded-full p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18" />
                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            {data.stops.length} 个地点 · {data.segments.length} 段路线 · 选择「添加」后点击地图
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {/* 天数 Tab：双击改名，拖拽排序 */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {data.days.map((d, i) => (
              editingDayId === d.id ? (
                <DayNameEditor
                  key={d.id}
                  dayId={d.id}
                  fallback={`第 ${i + 1} 天`}
                  onDone={() => setEditingDayId(null)}
                />
              ) : (
                <button
                  key={d.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    if (!Number.isNaN(from)) useTripStore.getState().reorderDays(from, i);
                  }}
                  onDoubleClick={() => setEditingDayId(d.id)}
                  onClick={() => setActiveDayId(d.id)}
                  title="双击改名 · 拖拽排序"
                  className={`cursor-grab rounded-full px-3 py-1.5 text-sm active:cursor-grabbing ${
                    d.id === dayId
                      ? "bg-emerald-600 text-white"
                      : "border border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
                  }`}
                >
                  {d.name ?? `第 ${i + 1} 天`}
                  <span className="ml-1 text-xs opacity-70">
                    {data.stops.filter((s) => s.dayId === d.id).length}
                  </span>
                </button>
              )
            ))}
            <button
              onClick={() => useTripStore.getState().addDay()}
              title="添加一天"
              className="rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-sm text-zinc-500 hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-700"
            >
              + 天
            </button>
            {data.days.length > 1 && (
              <button
                onClick={() => useTripStore.getState().removeDay(dayId)}
                title="删除当天"
                className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-400 hover:border-red-400 hover:text-red-500 dark:border-zinc-800"
              >
                删除
              </button>
            )}
          </div>

          {/* 当日实时天气（该天首个站点所在城市） */}
          <div className="mb-3 px-1">
            <WeatherBadge info={dayWeather[dayId]} />
          </div>

          {stops.length === 0 ? (
            <div className="mt-10 text-center text-sm text-zinc-400">
              <p className="text-3xl">📍</p>
              <p className="mt-2">用上方搜索框，或切到「添加」后点击地图</p>
              <p className="mt-1 text-xs">添加两个以上地点后会自动生成路线</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {stops.map((s, i) => (
                <StopCard key={s.id} stop={s} index={i} dayId={dayId} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function DayNameEditor({ dayId, fallback, onDone }: { dayId: string; fallback: string; onDone: () => void }) {
  const handled = useRef(false);
  const [value, setValue] = useState("");
  const commit = () => {
    handled.current = true;
    useTripStore.getState().renameDay(dayId, value);
    onDone();
  };
  const cancel = () => {
    handled.current = true;
    onDone();
  };
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={fallback}
      maxLength={50}
      onBlur={() => {
        if (!handled.current) commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") cancel();
      }}
      className="w-28 rounded-full border border-emerald-500 px-3 py-1.5 text-sm outline-none dark:bg-zinc-900"
    />
  );
}

function ShareButton({ trip }: { trip: Trip }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}/t/${trip.shareId}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          alert(`分享链接：${window.location.origin}/t/${trip.shareId}`);
        }
      }}
      className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700"
    >
      {copied ? "已复制 ✓" : "分享"}
    </button>
  );
}

function StopCard({
  stop,
  index,
  dayId,
}: {
  stop: { id: string; dayId: string; name: string; note?: string };
  index: number;
  dayId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stop.name);
  const [note, setNote] = useState(stop.note ?? "");
  const moveToDay = useTripStore((s) => s.moveStopToDay);
  const days = useTripStore((s) => s.trip?.data.days) ?? [];

  function commit() {
    useTripStore.getState().updateStop(stop.id, { name: name.trim() || "未命名地点", note: note.trim() });
    setEditing(false);
  }

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(index));
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const from = Number(e.dataTransfer.getData("text/plain"));
        if (!Number.isNaN(from)) {
          useTripStore.getState().reorder(dayId, from, index);
        }
      }}
      className="cursor-grab rounded-xl border border-zinc-200 bg-white px-3 py-2 active:cursor-grabbing dark:border-zinc-800 dark:bg-zinc-950"
    >
      {editing ? (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="地点名称"
            className="w-full rounded-lg border border-zinc-200 px-2 py-1 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备注（营业时间、预约、推荐菜…）"
            className="w-full rounded-lg border border-zinc-200 px-2 py-1 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={commit}
              className="rounded-full bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700"
            >
              保存
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-full px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              取消
            </button>
            {days.length > 1 && (
              <select
                value={stop.dayId}
                onChange={(e) => {
                  moveToDay(stop.id, e.target.value);
                  setEditing(false);
                }}
                className="ml-auto rounded-lg border border-zinc-200 px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-900"
              >
                {days.map((d, i) => (
                  <option key={d.id} value={d.id}>
                    第 {i + 1} 天
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1" onClick={() => setEditing(true)}>
            <div className="truncate text-sm">{stop.name || "未命名地点"}</div>
            {stop.note && <div className="truncate text-xs text-zinc-400">{stop.note}</div>}
          </div>
          <span className="text-xs text-zinc-300">拖拽排序</span>
          <button
            onClick={() => useTripStore.getState().removeStop(stop.id)}
            className="rounded-full px-2 py-1 text-xs text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
            title="删除"
          >
            ✕
          </button>
        </div>
      )}
    </li>
  );
}
