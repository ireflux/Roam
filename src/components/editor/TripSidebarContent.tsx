"use client";

import { useMemo, useRef, useState } from "react";
import type { TripData, TripStop } from "@/lib/types";
import { useTripStore } from "@/lib/useTripStore";
import { useDayWeather, WeatherBadge } from "@/components/weather/useDayWeather";
import { useTouchReorder } from "@/hooks/useTouchReorder";

interface TripSidebarContentProps {
  data: TripData;
  activeDayId: string | null;
  onDayChange: (dayId: string) => void;
  /** 头部附加内容（移动端抽屉：保存状态 + 撤销/重做 + 分享） */
  headerExtra?: React.ReactNode;
  /** 移动端：开启长按拖拽排序 + 点击卡片定位地图 */
  mobile?: boolean;
  onLocateStop?: (stop: TripStop) => void;
  /** 删除某个停留点后触发（用于「路线自动重连」反馈）。 */
  onStopDeleted?: () => void;
}

/**
 * 桌面侧栏与移动端底部抽屉共用的行程内容区：
 * 标题 / 天数 Tab（改名、排序）/ 天气 / 当天 Stop 列表。
 * 桌面走 HTML5 DnD；移动端走长按拖拽 + 点击卡片定位地图。
 */
export default function TripSidebarContent({
  data,
  activeDayId,
  onDayChange,
  headerExtra,
  mobile = false,
  onLocateStop,
  onStopDeleted,
}: TripSidebarContentProps) {
  const dayId = activeDayId ?? data.days[0]?.id ?? "";
  const stops = useMemo(
    () => data.stops.filter((s) => s.dayId === dayId).sort((a, b) => a.order - b.order),
    [data, dayId],
  );
  const dayWeather = useDayWeather(data.stops);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-zinc-200 px-4 pb-2 pt-3 dark:border-zinc-800">
        <div className="flex items-start gap-2">
          <TripTitle />
          <DeleteTripButton />
        </div>
        {headerExtra}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <DayTabs data={data} dayId={dayId} onDayChange={onDayChange} mobile={mobile} />
        <div className="mt-2 px-0.5">
          <WeatherBadge info={dayWeather[dayId]} />
        </div>
        {stops.length === 0 ? (
          <EmptyStops />
        ) : (
          <StopList stops={stops} dayId={dayId} mobile={mobile} onLocateStop={onLocateStop} onStopDeleted={onStopDeleted} />
        )}
      </div>
    </div>
  );
}

/* ----------------------------- 头部 ----------------------------- */

function TripTitle() {
  const trip = useTripStore((s) => s.trip);
  return (
    <input
      value={trip?.title ?? ""}
      onChange={(e) => useTripStore.getState().setTitle(e.target.value)}
      placeholder="路线标题"
      aria-label="路线标题"
      className="w-full flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-zinc-400 dark:text-zinc-100"
    />
  );
}

function DeleteTripButton() {
  const trip = useTripStore((s) => s.trip);
  const del = () => {
    if (!window.confirm("确定永久删除这条路线？此操作不可恢复。")) return;
    void fetch(`/api/trips/${trip?.id}`, { method: "DELETE" }).then((r) => {
      if (r.ok) window.location.href = "/";
      else alert("删除失败，请重试");
    });
  };
  return (
    <button
      onClick={del}
      title="删除这条路线"
      className="shrink-0 rounded-full p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 6h18" />
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
    </button>
  );
}

/* ------------------------------- 天数 Tab ------------------------------- */

function DayTabs({
  data,
  dayId,
  onDayChange,
  mobile,
}: {
  data: TripData;
  dayId: string;
  onDayChange: (id: string) => void;
  mobile: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const reorder = useTouchReorder(data.days, (from, to) => useTripStore.getState().reorderDays(from, to));

  const tabClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm ${
      active
        ? "bg-emerald-600 text-white"
        : "border border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
    } ${mobile ? "" : "cursor-grab active:cursor-grabbing"}`;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      {...(mobile
        ? {
            onPointerMove: reorder.onPointerMove,
            onPointerUp: reorder.onPointerUp,
            onPointerCancel: reorder.onPointerCancel,
          }
        : {})}
    >
      {data.days.map((d, i) =>
        editingId === d.id ? (
          <DayNameEditor key={d.id} dayId={d.id} fallback={`第 ${i + 1} 天`} onDone={() => setEditingId(null)} />
        ) : (
          <button
            key={d.id}
            data-reorder-index={i}
            onClick={() => onDayChange(d.id)}
            onDoubleClick={() => setEditingId(d.id)}
            {...(mobile ? { onPointerDown: (e: React.PointerEvent<HTMLElement>) => reorder.onPointerDown(e, i) } : {})}
            draggable={!mobile}
            onDragStart={!mobile ? (e) => e.dataTransfer.setData("text/plain", String(i)) : undefined}
            onDragOver={!mobile ? (e) => e.preventDefault() : undefined}
            onDrop={
              !mobile
                ? (e) => {
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    if (!Number.isNaN(from)) useTripStore.getState().reorderDays(from, i);
                  }
                : undefined
            }
            title={mobile ? "长按排序 · 双击改名" : "双击改名 · 拖拽排序"}
            className={tabClass(d.id === dayId)}
          >
            {d.name ?? `第 ${i + 1} 天`}
            <span className="ml-1 text-xs opacity-70">{data.stops.filter((s) => s.dayId === d.id).length}</span>
          </button>
        ),
      )}
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
  );
}

function DayNameEditor({ dayId, fallback, onDone }: { dayId: string; fallback: string; onDone: () => void }) {
  const [value, setValue] = useState("");
  const commit = () => {
    useTripStore.getState().renameDay(dayId, value);
    onDone();
  };
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={fallback}
      maxLength={50}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      className="w-28 rounded-full border border-emerald-500 px-3 py-1.5 text-sm outline-none dark:bg-zinc-900"
    />
  );
}

/* ------------------------------- Stop 列表 ------------------------------- */

function EmptyStops() {
  return (
    <div className="mt-10 text-center text-sm text-zinc-400">
      <p className="text-3xl">📍</p>
      <p className="mt-2">用上方搜索框，或切到「添加」后点击地图</p>
      <p className="mt-1 text-xs">添加两个以上地点后会自动生成路线</p>
    </div>
  );
}

function StopList({
  stops,
  dayId,
  mobile,
  onLocateStop,
  onStopDeleted,
}: {
  stops: TripStop[];
  dayId: string;
  mobile: boolean;
  onLocateStop?: (stop: TripStop) => void;
  onStopDeleted?: () => void;
}) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const reorder = useTouchReorder(stops, (from, to) => useTripStore.getState().reorder(dayId, from, to), listRef);

  // 移动端点卡片：先让地图飞行到该点并把卡片滚动进视野
  const locate = (stop: TripStop) => {
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-stop-id="${stop.id}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    onLocateStop?.(stop);
  };

  return (
    <ul
      ref={listRef}
      className="relative space-y-2"
      {...(mobile
        ? {
            onPointerMove: reorder.onPointerMove,
            onPointerUp: reorder.onPointerUp,
            onPointerCancel: reorder.onPointerCancel,
          }
        : {})}
    >
      {stops.map((stop, i) => (
        <StopCard
          key={stop.id}
          stop={stop}
          index={i}
          mobile={mobile}
          dragging={reorder.dragging && reorder.from === i}
          dragDelta={reorder.dragging && reorder.from === i ? reorder.deltaY : 0}
          onHandlePointerDown={mobile ? (e) => reorder.onPointerDown(e, i, { immediate: true }) : undefined}
          onLocateStop={locate}
          onStopDeleted={onStopDeleted}
        />
      ))}
      {reorder.hover && reorder.dragging && (
        <li aria-hidden className="pointer-events-none absolute left-3 right-3 z-30" style={{ top: reorder.hover.top }}>
          <div className="h-0.5 rounded-full bg-emerald-500" />
        </li>
      )}
    </ul>
  );
}

function StopCard({
  stop,
  index,
  mobile = false,
  dragging = false,
  dragDelta = 0,
  onHandlePointerDown,
  onLocateStop,
  onStopDeleted,
}: {
  stop: TripStop;
  index: number;
  mobile?: boolean;
  dragging?: boolean;
  dragDelta?: number;
  onHandlePointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  onLocateStop?: (stop: TripStop) => void;
  onStopDeleted?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stop.name);
  const [note, setNote] = useState(stop.note ?? "");
  const days = useTripStore((s) => s.trip?.data.days) ?? [];

  const commit = () => {
    useTripStore.getState().updateStop(stop.id, { name: name.trim() || "未命名地点", note: note.trim() });
    setEditing(false);
  };

  const cardClass = `rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950 ${
    dragging ? "z-10 scale-[1.02] shadow-2xl ring-2 ring-emerald-500" : "cursor-pointer"
  }`;

  return (
    <li
      data-stop-id={stop.id}
      data-reorder-index={index}
      className={`${cardClass} ${dragging ? "pointer-events-none" : ""}`}
      style={dragging ? { transform: `translateY(${dragDelta}px)` } : undefined}
    >
      {editing ? (
        <div className="space-y-2">
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
            <button onClick={commit} className="rounded-full bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700">
              保存
            </button>
            <button onClick={() => setEditing(false)} className="rounded-full px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              取消
            </button>
            {days.length > 1 && (
              <select
                value={stop.dayId}
                onChange={(e) => {
                  useTripStore.getState().moveStopToDay(stop.id, e.target.value);
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
        <div
          className="flex items-center gap-3"
          onClick={() => {
            if (mobile && onLocateStop) onLocateStop(stop);
            else setEditing(true);
          }}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{stop.name || "未命名地点"}</div>
            {stop.note && <div className="truncate text-xs text-zinc-400">{stop.note}</div>}
          </div>
          {mobile ? (
            <>
              <button
                aria-label="拖拽排序"
                onPointerDown={onHandlePointerDown}
                onPointerMove={(e) => e.stopPropagation()}
                title="按住拖动排序"
                className="shrink-0 touch-none cursor-grab rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 active:cursor-grabbing dark:hover:bg-zinc-800"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="9" cy="5" r="1.6" />
                  <circle cx="15" cy="5" r="1.6" />
                  <circle cx="9" cy="12" r="1.6" />
                  <circle cx="15" cy="12" r="1.6" />
                  <circle cx="9" cy="19" r="1.6" />
                  <circle cx="15" cy="19" r="1.6" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
                title="编辑"
                className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-emerald-600 dark:hover:bg-zinc-800"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
            </>
          ) : (
            <span className="text-xs text-zinc-300">拖拽排序</span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`删除地点「${stop.name || "未命名地点"}」？`)) {
                useTripStore.getState().removeStop(stop.id);
                onStopDeleted?.();
              }
            }}
            title="删除"
            className="shrink-0 rounded-full px-2 py-1 text-xs text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
          >
            ✕
          </button>
        </div>
      )}
    </li>
  );
}