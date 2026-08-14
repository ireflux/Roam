import { nanoid } from "nanoid";
import type {
  Mode,
  Position,
  SegmentPart,
  TripData,
  TripDay,
  TripSegment,
  TripStop,
} from "@/lib/types";
import { pathLengthM, roughDistanceM, simplifyLine, uniformSample } from "@/lib/trip/geo";

/**
 * 不可变契约：本文件所有操作绝不原地修改 data，总是返回新对象/新数组
 * （spread + map + filter 拷贝）。依赖此契约的调用方：
 * - useTripStore.pushHistory 以引用方式持有历史版本（结构性共享），不做深拷贝；
 * - no-op 时返回与原 data 相同的引用，`OpsResult.changed` 即由此推导。
 */

export interface SegmentRequest {
  segId: string;
  mode: Mode;
  from: Position;
  to: Position;
}

export interface OpsResult {
  data: TripData;
  needed: SegmentRequest[];
  /** 本次操作是否实际改变了 data（no-op 返回 false，且 data 与原引用相同）。 */
  changed: boolean;
  /** 新增实体的 id（addStop 等操作），避免调用方靠坐标等启发式反查。 */
  addedId?: string;
}

function result(prev: TripData, data: TripData, needed: SegmentRequest[], addedId?: string): OpsResult {
  return { data, needed, changed: data !== prev, ...(addedId !== undefined ? { addedId } : {}) };
}

/**
 * 稳定自动名：取现有「第 N 天」的最大 N + 1。删除/重排不会让新天与已有天重名，
 * 且名字一旦生成就存下来，显示不依赖数组下标。
 */
export function autoDayName(days: TripDay[]): string {
  let max = 0;
  for (const d of days) {
    const m = d.name?.match(/^第\s*(\d+)\s*天$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `第 ${max + 1} 天`;
}

/** 补齐缺失的天名（旧数据兼容）：无名字的天按未占用的最小序号生成自动名。 */
export function backfillDayNames(days: TripDay[]): TripDay[] {
  const used = new Set<number>();
  for (const d of days) {
    const m = d.name?.match(/^第\s*(\d+)\s*天$/);
    if (m) used.add(Number(m[1]));
  }
  return days.map((d) => {
    if (d.name) return d;
    let n = 1;
    while (used.has(n)) n += 1;
    used.add(n);
    return { ...d, name: `第 ${n} 天` };
  });
}

function ensureDay(data: TripData, dayId: string): TripData {
  if (data.days.some((d) => d.id === dayId)) return data;
  const day: TripDay = { id: dayId, name: autoDayName(data.days) };
  return { ...data, days: [...data.days, day] };
}

function stopsOfDay(data: TripData, dayId: string): TripStop[] {
  return data.stops
    .filter((s) => s.dayId === dayId)
    .sort((a, b) => a.order - b.order);
}

/** 某天的所有站点（渲染可见性的判定；与 stopsOfDay 的差异：不排序）。 */
export function dayStops(data: TripData, dayId: string): TripStop[] {
  return data.stops.filter((s) => s.dayId === dayId);
}

/** 某天可见的段：段归属 = 起点站所在天（跨天段随起点站显示）。 */
export function daySegments(data: TripData, dayId: string): TripSegment[] {
  const stopIds = new Set(dayStops(data, dayId).map((s) => s.id));
  return data.segments.filter((s) => stopIds.has(s.fromStop));
}

/**
 * 删除天后的 active 迁移：被删天恰是当前选中时返回相邻天（优先后一天，其次前一天），
 * 否则原样保留。纯函数，供 store 唯一协调 activeDayId。
 */
export function nextActiveAfterDayRemoved(days: TripDay[], removedId: string, activeId: string | null): string | null {
  if (activeId !== removedId) return activeId;
  const rest = days.filter((d) => d.id !== removedId);
  const idx = days.findIndex((d) => d.id === removedId);
  return rest[Math.min(idx, rest.length - 1)]?.id ?? null;
}

function posOf(stop: TripStop): Position {
  return [stop.lng, stop.lat];
}

/**
 * 按两点直线距离自动推荐出行方式（<1.5km 步行，1.5–8km 骑行，>8km 驾车；公交不自动）。
 */
export function suggestMode(distanceM: number): Mode {
  if (distanceM < 1500) return "walking";
  if (distanceM <= 8000) return "cycling";
  return "driving";
}

/**
 * 自动段：id 用 nanoid 而非 `A->B` 拼接——同一有序站点对出现在不同天时
 * 拼接 id 会碰撞，导致 applyRoute/删除/渲染互相覆盖。
 * 未显式指定方式时按两点直线距离启发式推荐。
 */
export function autoSegment(prev: TripStop, next: TripStop, mode?: Mode): TripSegment {
  const distanceM = roughDistanceM(posOf(prev), posOf(next));
  return {
    id: nanoid(10),
    fromStop: prev.id,
    toStop: next.id,
    mode: mode ?? suggestMode(distanceM),
    kind: "auto",
    geometry: {
      type: "LineString",
      coordinates: [posOf(prev), posOf(next)],
    },
    distanceM,
    durationMin: 0,
  };
}

export function segmentRequest(seg: TripSegment): SegmentRequest {
  const coords = seg.geometry.coordinates;
  const from = coords[0];
  const to = coords[coords.length - 1];
  return {
    segId: seg.id,
    mode: seg.mode,
    from,
    to,
  };
}

export function addStop(
  data: TripData,
  input: { dayId: string; name: string; lat: number; lng: number },
): OpsResult {
  const withDay = ensureDay(data, input.dayId);
  const dayStops = stopsOfDay(withDay, input.dayId);
  const stop: TripStop = {
    id: nanoid(10),
    dayId: input.dayId,
    name: input.name || "未命名地点",
    lat: input.lat,
    lng: input.lng,
    order: dayStops.length,
  };
  const needed: SegmentRequest[] = [];
  const prev = dayStops.at(-1);
  let nextData: TripData;
  if (prev) {
    const seg = autoSegment(prev, stop);
    needed.push(segmentRequest(seg));
    nextData = {
      ...withDay,
      stops: [...withDay.stops, stop],
      segments: [...withDay.segments, seg],
    };
  } else {
    nextData = { ...withDay, stops: [...withDay.stops, stop] };
  }
  return result(data, nextData, needed, stop.id);
}

export function removeStop(data: TripData, stopId: string): OpsResult {
  const stop = data.stops.find((s) => s.id === stopId);
  if (!stop) return result(data, data, []);
  const dayStops = stopsOfDay(data, stop.dayId);
  const idx = dayStops.findIndex((s) => s.id === stopId);
  const prev = idx > 0 ? dayStops[idx - 1] : null;
  const next = idx < dayStops.length - 1 ? dayStops[idx + 1] : null;

  const rest = data.segments.filter((s) => s.fromStop !== stopId && s.toStop !== stopId);
  const needed: SegmentRequest[] = [];

  if (prev && next) {
    // 从原始段（过滤前）继承被删站点前后的出行方式；无相邻偏好时按距离推荐
    const inheritMode: Mode | undefined =
      data.segments.find((s) => s.fromStop === prev.id && s.toStop === stopId)?.mode
      ?? data.segments.find((s) => s.fromStop === stopId && s.toStop === next.id)?.mode;
    const seg = autoSegment(prev, next, inheritMode);
    needed.push(segmentRequest(seg));
    return result(data, {
      ...data,
      stops: data.stops
        .filter((s) => s.id !== stopId)
        .map((s) =>
          s.dayId === stop.dayId && s.order > stop.order ? { ...s, order: s.order - 1 } : s,
        ),
      segments: [...rest, seg],
    }, needed);
  }

  return result(data, {
    ...data,
    stops: data.stops
      .filter((s) => s.id !== stopId)
      .map((s) =>
        s.dayId === stop.dayId && s.order > stop.order ? { ...s, order: s.order - 1 } : s,
      ),
    segments: rest,
  }, needed);
}

function pairKey(a: TripStop, b: TripStop): string {
  return `${a.id}|${b.id}`;
}

/**
 * 为新相邻对从相邻段继承出行方式（优先原方向，其次反向/相邻站点）；
 * 无任何相邻偏好时返回 undefined，由调用方落回距离启发式。
 */
function inheritNeighborMode(data: TripData, a: TripStop, b: TripStop): Mode | undefined {
  const direct = data.segments.find((s) => s.fromStop === a.id && s.toStop === b.id);
  if (direct) return direct.mode;
  const reverse = data.segments.find((s) => s.fromStop === b.id && s.toStop === a.id);
  if (reverse) return reverse.mode;
  return data.segments.find(
    (s) => s.toStop === a.id || s.fromStop === a.id || s.toStop === b.id || s.fromStop === b.id,
  )?.mode;
}

export function reorderStops(data: TripData, dayId: string, fromIdx: number, toIdx: number): OpsResult {
  const dayStops = stopsOfDay(data, dayId);
  if (fromIdx === toIdx || fromIdx < 0 || fromIdx >= dayStops.length || toIdx < 0 || toIdx >= dayStops.length) {
    return result(data, data, []);
  }
  const reordered = [...dayStops];
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, moved);
  const newOrder = new Map(reordered.map((s, i) => [s.id, i]));

  const stops = data.stops.map((s) =>
    newOrder.has(s.id) ? { ...s, order: newOrder.get(s.id)! } : s,
  );
  const nextData = { ...data, stops };

  // 记录旧顺序下的相邻对及其段；重排只重算「相邻对集合差集」中的新对，方向未变的相邻对
  // 保留段（含 freehand/snapped），不重算也不丢失手绘成果。
  const oldPairs = new Map<string, TripSegment>();
  for (let i = 0; i < dayStops.length - 1; i++) {
    const a = dayStops[i];
    const b = dayStops[i + 1];
    const seg = data.segments.find((s) => s.fromStop === a.id && s.toStop === b.id);
    if (seg) oldPairs.set(pairKey(a, b), seg);
  }

  const needed: SegmentRequest[] = [];
  const restSegments = nextData.segments.filter(
    (s) => !dayStops.some((d) => s.fromStop === d.id || s.toStop === d.id),
  );
  const segments: TripSegment[] = [...restSegments];

  for (let i = 0; i < reordered.length - 1; i++) {
    const a = reordered[i];
    const b = reordered[i + 1];
    const kept = oldPairs.get(pairKey(a, b));
    if (kept) {
      segments.push(kept);
      continue;
    }
    const seg = autoSegment(a, b, inheritNeighborMode(data, a, b));
    segments.push(seg);
    needed.push(segmentRequest(seg));
  }

  return result(data, { ...nextData, segments }, needed);
}

export function setSegmentMode(data: TripData, segId: string, mode: Mode): OpsResult {
  const seg = data.segments.find((s) => s.id === segId);
  if (!seg) return result(data, data, []);
  if (seg.kind !== "auto") {
    return result(data, {
      ...data,
      segments: data.segments.map((s) => (s.id === segId ? { ...s, mode, kind: "auto" as const } : s)),
    }, []);
  }
  const updated: TripSegment = { ...seg, mode, kind: "auto", durationMin: 0 };
  return result(data, { ...data, segments: data.segments.map((s) => (s.id === segId ? updated : s)) }, [segmentRequest(updated)]);
}

export function applyRoute(
  data: TripData,
  segId: string,
  result: {
    geometry: Position[];
    distanceM: number;
    durationMin: number;
    parts?: SegmentPart[];
  },
): TripData {
  const geometry = simplifyLine(result.geometry, { toleranceM: 10, maxPoints: 2500 });
  const parts = result.parts?.map((part) => ({
    kind: part.kind,
    coordinates: simplifyLine(part.coordinates, { toleranceM: 8, maxPoints: 800 }),
  }));
  return {
    ...data,
    segments: data.segments.map((s) =>
      s.id === segId
        ? {
            ...s,
            kind: "auto" as const,
            geometry: { type: "LineString" as const, coordinates: geometry },
            distanceM: result.distanceM,
            durationMin: result.durationMin,
            parts,
            // 真实路线成功写入，清除降级标记
            degraded: false,
          }
        : s,
    ),
  };
}

/** 降级直线：标记 degraded（keeps 来源 kind 语义不变），由渲染层以琥珀虚线区分。 */
export function applyFallbackLine(
  data: TripData,
  segId: string,
  result: { geometry: Position[]; distanceM: number; durationMin: number },
): TripData {
  return {
    ...data,
    segments: data.segments.map((s) =>
      s.id === segId
        ? {
            ...s,
            degraded: true,
            geometry: { type: "LineString" as const, coordinates: result.geometry },
            distanceM: result.distanceM,
            durationMin: result.durationMin,
          }
        : s,
    ),
  };
}

const SNAP_DISTANCE_M = 100;
/** 首尾吸附到同一站点时的最小绘制路径长度（米）：小于该值视为误触手滑，忽略本次绘制。 */
const MIN_LOOP_PATH_M = 200;

function findNearStop(stops: TripStop[], p: Position): TripStop | null {
  let best: TripStop | null = null;
  let bestD = SNAP_DISTANCE_M;
  for (const s of stops) {
    const d = roughDistanceM([s.lng, s.lat], p);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export function completeFreehand(
  data: TripData,
  points: Position[],
  /** 无吸附端点时新建站点归属的天（编辑器传入当前选中的天）。 */
  fallbackDayId?: string,
): OpsResult {
  if (points.length < 2) return result(data, data, []);
  const geometry = simplifyLine(points, { toleranceM: 8, maxPoints: 2000 });
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  const start = findNearStop(data.stops, first);
  const end = findNearStop(data.stops, last);
  // 首尾吸附到同一站点 = 环形路线（如绕一圈回起点）。此时首尾坐标必然各自距站点 <100m，
  // 端点直线距离永远不足 200m，故以「绘制路径总长」判定：明显成环才保留，误触手滑则忽略。
  if (start && start === end && pathLengthM(geometry) < MIN_LOOP_PATH_M) {
    return result(data, data, []);
  }
  const dayId = start?.dayId ?? end?.dayId ?? fallbackDayId ?? data.days[0]?.id ?? "d1";

  const newStops: TripStop[] = [];
  let from = start;
  let to = end;
  const nextOrder = () => data.stops.filter((s) => s.dayId === dayId).length + newStops.length;
  if (!from) {
    from = {
      id: nanoid(10),
      dayId,
      name: "绘制起点",
      lat: first[1],
      lng: first[0],
      order: nextOrder(),
    };
    newStops.push(from);
  }
  if (!to) {
    to = {
      id: nanoid(10),
      dayId,
      name: "绘制终点",
      lat: last[1],
      lng: last[0],
      order: nextOrder(),
    };
    newStops.push(to);
  }

  const seg: TripSegment = {
    id: nanoid(10),
    fromStop: from.id,
    toStop: to.id,
    // 仅作标签：手绘段不自动规划路线，按绘制路径总长启发式
    mode: suggestMode(pathLengthM(geometry)),
    kind: "freehand",
    geometry: { type: "LineString", coordinates: geometry },
    distanceM: roughDistanceM(first, last),
    durationMin: 0,
  };
  return result(data, {
    ...data,
    stops: [...data.stops, ...newStops],
    segments: [...data.segments, seg],
  }, []);
}

export function updateSegmentVertex(
  data: TripData,
  segId: string,
  vertexIndex: number,
  position: Position,
): TripData {
  return {
    ...data,
    segments: data.segments.map((s) => {
      if (s.id !== segId) return s;
      const coords = s.geometry.coordinates.map((c, i) =>
        i === vertexIndex ? position : c,
      );
      // 手动改线后不再代表原始公交/地铁方案，清掉子段，避免渲染仍按旧 parts
      return { ...s, geometry: { type: "LineString", coordinates: coords }, parts: undefined };
    }),
  };
}

export function markSegmentSnapped(data: TripData, segId: string): TripData {
  return {
    ...data,
    segments: data.segments.map((s) =>
      s.id === segId ? { ...s, kind: "snapped" as const, degraded: false } : s,
    ),
  };
}

/**
 * 旧数据兼容：段 id 去重。历史上自动段 id 为 `A->B` 拼接，同一有序点对出现在
 * 多个天时会产生重复 id，导致路线写入/删除互相覆盖；加载时给重复 id 重新分配。
 */
export function repairSegmentIds(data: TripData): TripData {
  const seen = new Set<string>();
  let changed = false;
  const segments = data.segments.map((s) => {
    if (seen.has(s.id)) {
      changed = true;
      return { ...s, id: nanoid(10) };
    }
    seen.add(s.id);
    return s;
  });
  return changed ? { ...data, segments } : data;
}

export function simplifyVertices(coords: Position[], maxPoints: number): Position[] {
  return uniformSample(coords, maxPoints);
}

export function addDay(data: TripData): OpsResult {
  const day: TripDay = { id: nanoid(10), name: autoDayName(data.days) };
  return result(data, { ...data, days: [...data.days, day] }, [], day.id);
}

/**
 * 重命名天；空名称回填自动名（不再重置为 undefined，确保天名永远稳定存储，
 * 显示不依赖数组顺序）。
 */
export function renameDay(data: TripData, dayId: string, name: string): OpsResult {
  const target = data.days.find((d) => d.id === dayId);
  if (!target) return result(data, data, []);
  const trimmed = name.trim().slice(0, 50);
  const next = trimmed || autoDayName(data.days);
  if (target.name === next) return result(data, data, []);
  return result(data, {
    ...data,
    days: data.days.map((d) => (d.id === dayId ? { ...d, name: next } : d)),
  }, []);
}

/** 天顺序重排（纯展示顺序，不改任何站点的 dayId/order）。 */
export function reorderDays(data: TripData, fromIdx: number, toIdx: number): OpsResult {
  const days = data.days;
  if (fromIdx === toIdx || days.length < 2 || fromIdx < 0 || fromIdx >= days.length || toIdx < 0 || toIdx >= days.length) {
    return result(data, data, []);
  }
  const reordered = [...days];
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, moved);
  return result(data, { ...data, days: reordered }, []);
}

export function removeDay(data: TripData, dayId: string): OpsResult {
  if (data.days.length <= 1) return result(data, data, []);
  const dayStopIds = new Set(data.stops.filter((s) => s.dayId === dayId).map((s) => s.id));
  return result(data, {
    ...data,
    days: data.days.filter((d) => d.id !== dayId),
    stops: data.stops.filter((s) => s.dayId !== dayId),
    segments: data.segments.filter(
      (s) => !dayStopIds.has(s.fromStop) && !dayStopIds.has(s.toStop),
    ),
  }, []);
}

export function moveStopToDay(data: TripData, stopId: string, dayId: string): OpsResult {
  const stop = data.stops.find((s) => s.id === stopId);
  const day = data.days.find((d) => d.id === dayId);
  if (!stop || !day || stop.dayId === dayId) return result(data, data, []);
  const targetCount = data.stops.filter((s) => s.dayId === dayId).length;

  const stops = data.stops.map((s) => {
    if (s.id === stopId) return { ...s, dayId, order: targetCount };
    if (s.dayId === stop.dayId && s.order > stop.order) return { ...s, order: s.order - 1 };
    return s;
  });

  const segments = data.segments.filter(
    (s) => s.fromStop !== stopId && s.toStop !== stopId,
  );
  const needed: SegmentRequest[] = [];

  const srcSorted = data.stops
    .filter((s) => s.dayId === stop.dayId)
    .sort((a, b) => a.order - b.order);
  const srcIdx = srcSorted.findIndex((s) => s.id === stopId);
  const prev = srcIdx > 0 ? srcSorted[srcIdx - 1] : null;
  const next = srcIdx < srcSorted.length - 1 ? srcSorted[srcIdx + 1] : null;
  if (prev && next) {
    // 继承被移走站点原前后段的出行方式（来源段仍存在于原始 data.segments）；无相邻偏好时按距离推荐
    const reconnectMode: Mode | undefined =
      data.segments.find((s) => s.fromStop === prev.id && s.toStop === stopId)?.mode
      ?? data.segments.find((s) => s.fromStop === stopId && s.toStop === next.id)?.mode;
    const seg = autoSegment(prev, next, reconnectMode);
    segments.push(seg);
    needed.push(segmentRequest(seg));
  }

  const targetSorted = [...data.stops.filter((s) => s.dayId === dayId).sort((a, b) => a.order - b.order), stop];
  if (targetSorted.length >= 2) {
    const a = targetSorted[targetSorted.length - 2];
    const b = stop;
    // 新尾段段继承站点原有的到达/出发方式；无相邻偏好时按距离推荐
    const carriedMode: Mode | undefined =
      data.segments.find((s) => s.toStop === stopId)?.mode
      ?? data.segments.find((s) => s.fromStop === stopId)?.mode;
    const seg = autoSegment(a, b, carriedMode);
    segments.push(seg);
    needed.push(segmentRequest(seg));
  }

  return result(data, { ...data, stops, segments }, needed);
}

export function updateStop(
  data: TripData,
  stopId: string,
  patch: { name?: string; note?: string; category?: string },
): TripData {
  return {
    ...data,
    stops: data.stops.map((s) => (s.id === stopId ? { ...s, ...patch } : s)),
  };
}

/** 设置/清除某天的日期（YYYY-MM-DD）；非法日期或相同值 no-op，返回原引用。 */
export function setDayDate(data: TripData, dayId: string, date: string | null): OpsResult {
  const target = data.days.find((d) => d.id === dayId);
  if (!target) return result(data, data, []);
  if (date === null || date === "") {
    if (!target.date) return result(data, data, []);
    return result(data, { ...data, days: data.days.map((d) => (d.id === dayId ? { ...d, date: undefined } : d)) }, []);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return result(data, data, []);
  const [y, m, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, day));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== day) {
    return result(data, data, []);
  }
  if (target.date === date) return result(data, data, []);
  return result(data, { ...data, days: data.days.map((d) => (d.id === dayId ? { ...d, date } : d)) }, []);
}

/* ------------------------------- 统计与密度 ------------------------------- */

export interface DaySummary {
  stops: number;
  distanceM: number;
  durationMin: number;
  segments: number;
}

export interface TripSummary extends DaySummary {
  days: number;
}

function sumSegments(segments: TripSegment[]): { distanceM: number; durationMin: number } {
  return segments.reduce(
    (acc, s) => ({
      distanceM: acc.distanceM + (s.distanceM ?? 0),
      durationMin: acc.durationMin + (s.durationMin ?? 0),
    }),
    { distanceM: 0, durationMin: 0 },
  );
}

/** 单日统计：站点数 / 里程 / 时长（来自段上的 distanceM/durationMin，缺失不计）。 */
export function summarizeDay(data: TripData, dayId: string): DaySummary {
  const segments = daySegments(data, dayId);
  const { distanceM, durationMin } = sumSegments(segments);
  return { stops: dayStops(data, dayId).length, distanceM, durationMin, segments: segments.length };
}

/** 行程总览统计。 */
export function summarizeTrip(data: TripData): TripSummary {
  const { distanceM, durationMin } = sumSegments(data.segments);
  return {
    days: data.days.length,
    stops: data.stops.length,
    distanceM,
    durationMin,
    segments: data.segments.length,
  };
}

/** 密度预警阈值：单日任一命中即提示「可能太赶」。 */
const WARN_MAX_DISTANCE_M = 150_000;
const WARN_MAX_DURATION_MIN = 5 * 60;
const WARN_MAX_STOPS = 8;

/**
 * 单日密度体检：返回是否偏赶及原因文案。
 * 文案按最突出的指标给出一条（优先里程，其次时长，最后站点数），避免多条同时刷屏。
 */
export function dayDensityWarnings(summary: DaySummary): { warn: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (summary.distanceM > WARN_MAX_DISTANCE_M) {
    reasons.push(`行程约 ${Math.round(summary.distanceM / 1000)} 公里，可能太赶`);
  } else if (summary.durationMin > WARN_MAX_DURATION_MIN) {
    reasons.push(`路上约 ${Math.round(summary.durationMin / 60)} 小时，可能太赶`);
  } else if (summary.stops > WARN_MAX_STOPS) {
    reasons.push(`安排了 ${summary.stops} 个地点，可能太赶`);
  }
  return { warn: reasons.length > 0, reasons };
}
