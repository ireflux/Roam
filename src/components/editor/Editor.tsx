"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Mode, Position, Trip } from "@/lib/types";
import { MODE_ICON, MODE_LABEL } from "@/lib/types";
import { useTripStore, type Tool } from "@/lib/useTripStore";
import MapLayers from "@/components/editor/MapLayers";
import SearchBox from "@/components/editor/SearchBox";
import { useFreehandDraw } from "@/components/editor/useFreehandDraw";
import { useVertexSnap } from "@/components/editor/useVertexSnap";

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
  const canUndo = useTripStore((s) => s.canUndo);
  const canRedo = useTripStore((s) => s.canRedo);

  useEffect(() => {
    load(trip);
  }, [trip, load]);

  const data = storeTrip?.data ?? trip.data;
  const dayId = activeDayId ?? data.days[0]?.id ?? "";
  const stops = data.stops
    .filter((s) => s.dayId === dayId)
    .sort((a, b) => a.order - b.order);
  const selectedSeg = data.segments.find((s) => s.id === selectedSegId);

  function pickStop(name: string, lng: number, lat: number) {
    useTripStore.getState().addStopAt({ name, lat, lng, mode: currentMode });
  }

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
            {(["driving", "walking", "cycling"] as Mode[]).map((m) => (
              <button
                key={m}
                title={MODE_LABEL[m]}
                onClick={() => useTripStore.getState().setCurrentMode(m)}
                className={`px-3 py-2 text-sm ${currentMode === m ? "bg-emerald-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
              >
                {MODE_ICON[m]}
              </button>
            ))}
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
          <ShareButton trip={storeTrip ?? trip} />
        </div>

        {/* 选中段操作条 */}
        {selectedSeg && (
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 shadow-lg dark:bg-zinc-900">
            <span className="text-sm text-zinc-600 dark:text-zinc-300">本段出行方式</span>
            {(["driving", "walking", "cycling"] as Mode[]).map((m) => (
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
          <input
            value={storeTrip?.title ?? trip.title ?? ""}
            onChange={(e) => useTripStore.getState().setTitle(e.target.value)}
            placeholder="路线标题"
            className="w-full bg-transparent text-lg font-semibold outline-none placeholder:text-zinc-400"
          />
          <p className="mt-1 text-xs text-zinc-400">
            {data.stops.length} 个地点 · {data.segments.length} 段路线 · 选择「添加」后点击地图
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {/* 天数 Tab */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {data.days.map((d, i) => (
              <button
                key={d.id}
                onClick={() => setActiveDayId(d.id)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  d.id === dayId
                    ? "bg-emerald-600 text-white"
                    : "border border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
                }`}
              >
                第 {i + 1} 天
                <span className="ml-1 text-xs opacity-70">
                  {data.stops.filter((s) => s.dayId === d.id).length}
                </span>
              </button>
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
