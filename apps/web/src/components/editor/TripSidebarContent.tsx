"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarDays, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import type { TripData, TripStop } from "@roam/core";
import { useTripStore } from "@/lib/useTripStore";
import { useDayWeather, WeatherBadge, weatherPoints } from "@/components/weather/useDayWeather";
import { useTouchReorder } from "@/hooks/useTouchReorder";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { dayDensityWarnings, summarizeDay, summarizeTrip } from "@roam/core";
import { formatDistance, formatDuration } from "@roam/core";

interface TripSidebarContentProps {
  data: TripData;
  activeDayId: string | null;
  onDayChange: (dayId: string) => void;
  /** 头部附加内容（移动端抽屉：保存状态 + 撤销/重做 + 分享） */
  headerExtra?: React.ReactNode;
  /** 移动端：开启长按拖拽排序 + 点击卡片定位地图 */
  mobile?: boolean;
  onLocateStop?: (stop: TripStop) => void;
  /** 删除某个停留点后触发（用于「撤销」toast 反馈）。 */
  onStopDeleted?: (stop: TripStop) => void;
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
  const dayWeather = useDayWeather(weatherPoints(data));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line px-4 pb-3 pt-3">
        <div className="flex items-start gap-2">
          <TripTitle />
          <DeleteTripButton />
        </div>
        <TripOverview data={data} />
        {headerExtra}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <DayTabs data={data} dayId={dayId} onDayChange={onDayChange} mobile={mobile} />
        <DayStatsLine data={data} dayId={dayId} />
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => {
    setDraft(trip?.title ?? "");
    setEditing(true);
  };
  const commit = () => {
    const next = draft.trim();
    if (next && next !== trip?.title) useTripStore.getState().setTitle(next);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        data-testid="trip-title-input"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="路线标题"
        aria-label="路线标题"
        maxLength={100}
        className="w-full flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-faint"
      />
    );
  }

  return (
    <button
      data-testid="trip-title-button"
      onClick={startEdit}
      title="点击编辑标题"
      className="group flex w-full flex-1 cursor-pointer items-baseline gap-1.5 bg-transparent text-left text-lg font-semibold tracking-tight outline-none"
    >
      <span className={trip?.title?.trim() ? "" : "text-faint"}>
        {trip?.title?.trim() || "路线标题"}
      </span>
      <Pencil
        size={13}
        className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </button>
  );
}

function DeleteTripButton() {
  const trip = useTripStore((s) => s.trip);
  const [open, setOpen] = useState(false);
  const del = () => {
    setOpen(false);
    void fetch(`/api/trips/${trip?.id}`, { method: "DELETE" }).then((r) => {
      if (r.ok) window.location.href = "/";
      else alert("删除失败，请重试");
    });
  };
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="删除这条路线"
        aria-label="删除这条路线"
        className="shrink-0 cursor-pointer rounded-full p-2 text-faint transition-interact hover:bg-danger-soft hover:text-danger"
      >
        <Trash2 size={14} />
      </button>
      <ConfirmDialog
        open={open}
        title="删除这条路线？"
        message={`确定永久删除「${trip?.title || "未命名路线"}」？此操作不可恢复。`}
        onConfirm={del}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

/** 顶部总览：天数 / 站点 / 总里程 / 总时长（仅在有值时展示后者）。 */
function TripOverview({ data }: { data: TripData }) {
  const summary = useMemo(() => summarizeTrip(data), [data]);
  const parts = [`${summary.days} 天`, `${summary.stops} 个地点`];
  if (summary.distanceM > 0) parts.push(formatDistance(summary.distanceM));
  if (summary.durationMin > 0) parts.push(`约 ${formatDuration(summary.durationMin)}`);
  return (
    <p className="mt-1.5 text-xs text-faint" aria-label="行程总览">
      {parts.join("  ·  ")}
    </p>
  );
}

/** 当天统计 + 密度预警（太赶时琥珀提示）。 */
function DayStatsLine({ data, dayId }: { data: TripData; dayId: string }) {
  const summary = useMemo(() => summarizeDay(data, dayId), [data, dayId]);
  const density = useMemo(() => dayDensityWarnings(summary), [summary]);
  if (summary.stops === 0) return null;
  const parts = [`${summary.stops} 站`];
  if (summary.distanceM > 0) parts.push(formatDistance(summary.distanceM));
  if (summary.durationMin > 0) parts.push(`约 ${formatDuration(summary.durationMin)}`);
  return (
    <div className="mt-2.5 px-0.5 text-xs">
      <span className="text-faint">{parts.join("  ·  ")}</span>
      {density.warn && (
        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 font-medium text-amber">
          {density.reasons[0]}
        </span>
      )}
    </div>
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
  const [dateEditId, setDateEditId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const reorder = useTouchReorder(data.days, (from, to) => useTripStore.getState().reorderDays(from, to));
  const pendingDay = data.days.find((d) => d.id === pendingDeleteId);
  const pendingDayStopCount = data.stops.filter((s) => s.dayId === pendingDeleteId).length;

  const tabClass = (active: boolean) =>
    `flex items-center rounded-full px-3 py-1.5 text-sm transition-interact ${
      active
        ? "bg-brand text-white shadow-sm"
        : "border border-line text-muted hover:border-brand/40 hover:text-brand"
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
          <div
            key={d.id}
            role="button"
            tabIndex={0}
            data-reorder-index={i}
            onClick={() => onDayChange(d.id)}
            onDoubleClick={() => setEditingId(d.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onDayChange(d.id);
              }
            }}
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
            className={`${tabClass(d.id === dayId)} ${mobile ? "" : "outline-none focus-visible:ring-2 focus-visible:ring-brand/40"}`}
          >
            {d.name ?? `第 ${i + 1} 天`}
            <span className="ml-1 text-xs opacity-70">{data.stops.filter((s) => s.dayId === d.id).length}</span>
            {dateEditId === d.id ? (
              <span
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                className="ml-1 inline-flex items-center gap-1"
              >
                <input
                  type="date"
                  autoFocus
                  defaultValue={d.date ?? ""}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setDateEditId(null);
                  }}
                  onBlur={(e) => {
                    setDateEditId(null);
                    useTripStore.getState().setDayDate(d.id, e.target.value || null);
                  }}
                  className="w-[7.5rem] rounded-lg border border-brand px-1 py-0.5 text-xs outline-none focus:ring-2 focus:ring-brand/30"
                />
                <button
                  aria-label="清除日期"
                  onPointerDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    useTripStore.getState().setDayDate(d.id, null);
                    setDateEditId(null);
                  }}
                  className="cursor-pointer rounded-full px-1 text-faint transition-interact hover:text-danger"
                >
                  <X size={12} />
                </button>
              </span>
            ) : (
              <button
                aria-label={`设置 ${d.name ?? `第 ${i + 1} 天`} 日期`}
                title={d.date ? `日期：${d.date.slice(5).replace("-", ".")}，点击修改（用于天气预报）` : "设置日期（用于天气预报）"}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setDateEditId(d.id);
                }}
                className={`ml-1 cursor-pointer rounded-full p-0.5 transition-interact ${
                  d.id === dayId ? "text-white/85 hover:bg-white/20" : "text-faint hover:bg-brand-soft hover:text-brand"
                }`}
              >
                {d.date ? (
                  <span className="text-xs leading-none">{d.date.slice(5).replace("-", ".")}</span>
                ) : (
                  <CalendarDays size={13} />
                )}
              </button>
            )}
            {data.days.length > 1 && (
              <button
                aria-label={`删除 ${d.name ?? `第 ${i + 1} 天`}`}
                title="删除这一天"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDeleteId(d.id);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className={`ml-1 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full transition-interact ${
                  d.id === dayId
                    ? "text-white/70 hover:bg-white/25 hover:text-white"
                    : "text-faint hover:bg-danger-soft hover:text-danger"
                }`}
              >
                <X size={12} />
              </button>
            )}
          </div>
        ),
      )}
      <button
        onClick={() => useTripStore.getState().addDay()}
        title="添加一天"
        aria-label="添加一天"
        className="flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-line-strong px-3 py-1.5 text-sm text-muted transition-interact hover:border-brand hover:text-brand"
      >
        <Plus size={13} />
        <span>天</span>
      </button>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title={`删除「${pendingDay?.name ?? "这一天"}」？`}
        message={`该天的 ${pendingDayStopCount} 个地点及路线会一并移除，可稍后用撤销恢复。`}
        onConfirm={() => {
          const deleted = pendingDeleteId;
          if (!deleted) return;
          useTripStore.getState().removeDay(deleted);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
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
      className="w-28 rounded-full border border-brand px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand/30"
    />
  );
}

/* ------------------------------- Stop 列表 ------------------------------- */

function EmptyStops() {
  return (
    <div className="mt-12 text-center">
      <JourneyLine className="mx-auto" />
      <p className="mt-4 text-sm font-medium text-muted">从地图开始你的旅程</p>
      <p className="mt-1 text-xs leading-relaxed text-faint">
        用上方搜索框，或切到「添加」后点击地图
        <br />
        两个地点之间会自动生成路线
      </p>
    </div>
  );
}

/** 空状态插画：一段延伸到远方的虚线旅程轨迹（签名元素）。 */
function JourneyLine({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="172"
      height="64"
      viewBox="0 0 172 64"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 52 C 30 52, 24 16, 54 16 S 92 40 116 30 S 150 14 166 14"
        stroke="var(--line-strong)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="2 7"
        opacity="0.8"
      />
      <circle cx="54" cy="16" r="5.5" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2" />
      <text
        x="54"
        y="19.5"
        textAnchor="middle"
        fontSize="9"
        fontWeight="600"
        fill="var(--brand)"
      >
        1
      </text>
      <circle cx="116" cy="30" r="5" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2" opacity="0.7" />
      <circle cx="166" cy="14" r="5" fill="var(--gold)" />
    </svg>
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
  onStopDeleted?: (stop: TripStop) => void;
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
    <div className="relative mt-3">
      {/* 时间线轨道：贯穿整列路点的连接线 */}
      <span
        className="absolute bottom-1 left-[13px] top-2 w-px bg-gradient-to-b from-brand/50 via-line to-line"
        aria-hidden
      />
      <ul
        ref={listRef}
        className="relative space-y-2.5"
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
            total={stops.length}
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
            <div className="h-0.5 rounded-full bg-brand" />
          </li>
        )}
      </ul>
    </div>
  );
}

function StopCard({
  stop,
  index,
  total,
  mobile = false,
  dragging = false,
  dragDelta = 0,
  onHandlePointerDown,
  onLocateStop,
  onStopDeleted,
}: {
  stop: TripStop;
  index: number;
  total: number;
  mobile?: boolean;
  dragging?: boolean;
  dragDelta?: number;
  onHandlePointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  onLocateStop?: (stop: TripStop) => void;
  onStopDeleted?: (stop: TripStop) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stop.name);
  const [note, setNote] = useState(stop.note ?? "");
  const days = useTripStore((s) => s.trip?.data.days) ?? [];

  const commit = () => {
    useTripStore.getState().updateStop(stop.id, { name: name.trim() || "未命名地点", note: note.trim() });
    setEditing(false);
  };

  const isLast = index === total - 1;

  return (
    <li
      data-stop-id={stop.id}
      data-reorder-index={index}
      className={`relative pl-10 ${dragging ? "pointer-events-none" : ""}`}
      style={dragging ? { transform: `translateY(${dragDelta}px)` } : undefined}
    >
      {/* 路点圆点：编号即顺序；终点用金色（与分享页签名一致） */}
      <span
        className={`absolute left-0 top-3 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold shadow-sm transition-colors ${
          isLast ? "bg-gold text-white" : "bg-brand text-white"
        }`}
        aria-hidden
      >
        {index + 1}
      </span>
      <div
        className={`group rounded-2xl border bg-surface px-3 py-2.5 shadow-card transition-all ${
          dragging
            ? "z-10 scale-[1.02] border-brand/40 shadow-float-lg ring-2 ring-brand/30"
            : "border-line hover:border-brand/30 hover:shadow-float"
        }`}
      >
        {editing ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="地点名称"
              className="w-full rounded-lg border border-line px-2 py-1.5 text-sm outline-none transition-interact focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="备注（营业时间、预约、推荐菜…）"
              className="w-full rounded-lg border border-line px-2 py-1.5 text-xs outline-none transition-interact focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={commit}
                className="cursor-pointer rounded-full bg-brand px-3 py-1 text-xs font-medium text-white transition-interact hover:bg-brand-deep"
              >
                保存
              </button>
              <button
                onClick={() => setEditing(false)}
                className="cursor-pointer rounded-full px-3 py-1 text-xs text-muted transition-interact hover:bg-surface-soft hover:text-ink"
              >
                取消
              </button>
              {days.length > 1 && (
                <select
                  value={stop.dayId}
                  onChange={(e) => {
                    useTripStore.getState().moveStopToDay(stop.id, e.target.value);
                    setEditing(false);
                  }}
                  className="ml-auto cursor-pointer rounded-lg border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-brand"
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
          <div className="flex cursor-pointer items-center gap-2" onClick={() => onLocateStop?.(stop)}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{stop.name || "未命名地点"}</div>
              {stop.note && <div className="mt-0.5 truncate text-xs text-faint">{stop.note}</div>}
            </div>
            {mobile ? (
              <button
                aria-label="拖拽排序"
                onPointerDown={onHandlePointerDown}
                onPointerMove={(e) => e.stopPropagation()}
                title="按住拖动排序"
                className="shrink-0 cursor-grab touch-none rounded-full p-1.5 text-faint transition-interact hover:bg-surface-soft hover:text-muted active:cursor-grabbing"
              >
                <GripVertical size={15} />
              </button>
            ) : (
              <span className="text-[10px] text-faint opacity-0 transition-opacity group-hover:opacity-100 select-none">
                拖拽排序
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              title="编辑"
              aria-label={`编辑 ${stop.name || "未命名地点"}`}
              className={`shrink-0 cursor-pointer rounded-full p-1.5 text-faint transition-interact hover:bg-brand-soft hover:text-brand ${
                mobile ? "" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
              }`}
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                useTripStore.getState().removeStop(stop.id);
                onStopDeleted?.(stop);
              }}
              title="删除"
              aria-label={`删除 ${stop.name || "未命名地点"}`}
              className={`shrink-0 cursor-pointer rounded-full p-1.5 text-faint transition-interact hover:bg-danger-soft hover:text-danger ${
                mobile ? "" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
              }`}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}