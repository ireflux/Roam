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
import { roughDistanceM, simplifyLine, uniformSample } from "@/lib/trip/geo";

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
}

function result(prev: TripData, data: TripData, needed: SegmentRequest[]): OpsResult {
  return { data, needed, changed: data !== prev };
}

function ensureDay(data: TripData, dayId: string): TripData {
  if (data.days.some((d) => d.id === dayId)) return data;
  const day: TripDay = { id: dayId, name: "第 1 天" };
  return { ...data, days: [...data.days, day] };
}

function stopsOfDay(data: TripData, dayId: string): TripStop[] {
  return data.stops
    .filter((s) => s.dayId === dayId)
    .sort((a, b) => a.order - b.order);
}

function posOf(stop: TripStop): Position {
  return [stop.lng, stop.lat];
}

export function autoSegment(prev: TripStop, next: TripStop, mode: Mode): TripSegment {
  return {
    id: `${prev.id}->${next.id}`,
    fromStop: prev.id,
    toStop: next.id,
    mode,
    kind: "auto",
    geometry: {
      type: "LineString",
      coordinates: [posOf(prev), posOf(next)],
    },
    distanceM: roughDistanceM(posOf(prev), posOf(next)),
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
  input: { dayId: string; name: string; lat: number; lng: number; mode: Mode },
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
  if (prev) {
    const seg = autoSegment(prev, stop, input.mode);
    needed.push(segmentRequest(seg));
    return result(data, {
      ...withDay,
      stops: [...withDay.stops, stop],
      segments: [...withDay.segments, seg],
    }, needed);
  }
  return result(data, { ...withDay, stops: [...withDay.stops, stop] }, needed);
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
    // 从原始段（过滤前）继承被删站点前后的出行方式，避免恒为 driving
    const inheritMode: Mode =
      data.segments.find((s) => s.fromStop === prev.id && s.toStop === stopId)?.mode
      ?? data.segments.find((s) => s.fromStop === stopId && s.toStop === next.id)?.mode
      ?? "driving";
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

/** 为新相邻对从相邻段继承出行方式（优先原方向，其次反向/相邻站点）。 */
function inheritNeighborMode(data: TripData, a: TripStop, b: TripStop): Mode {
  const direct = data.segments.find((s) => s.fromStop === a.id && s.toStop === b.id);
  if (direct) return direct.mode;
  const reverse = data.segments.find((s) => s.fromStop === b.id && s.toStop === a.id);
  if (reverse) return reverse.mode;
  const touching = data.segments.find(
    (s) => s.toStop === a.id || s.fromStop === a.id || s.toStop === b.id || s.fromStop === b.id,
  );
  return touching?.mode ?? "driving";
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
          }
        : s,
    ),
  };
}

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
            kind: "freehand" as const,
            geometry: { type: "LineString" as const, coordinates: result.geometry },
            distanceM: result.distanceM,
            durationMin: result.durationMin,
          }
        : s,
    ),
  };
}

const SNAP_DISTANCE_M = 100;

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
  mode: Mode,
): OpsResult {
  if (points.length < 2) return result(data, data, []);
  const geometry = simplifyLine(points, { toleranceM: 8, maxPoints: 2000 });
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  const start = findNearStop(data.stops, first);
  const end = findNearStop(data.stops, last);
  const dayId = start?.dayId ?? end?.dayId ?? data.days[0]?.id ?? "d1";

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
    mode,
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
      return { ...s, geometry: { type: "LineString", coordinates: coords } };
    }),
  };
}

export function markSegmentSnapped(data: TripData, segId: string): TripData {
  return {
    ...data,
    segments: data.segments.map((s) => (s.id === segId ? { ...s, kind: "snapped" as const } : s)),
  };
}

export function simplifyVertices(coords: Position[], maxPoints: number): Position[] {
  return uniformSample(coords, maxPoints);
}

export function addDay(data: TripData): OpsResult {
  const day: TripDay = { id: nanoid(10), name: `第 ${data.days.length + 1} 天` };
  return result(data, { ...data, days: [...data.days, day] }, []);
}

/** 重命名天；空名称重置为 null（UI fallback 回「第 N 天」）。 */
export function renameDay(data: TripData, dayId: string, name: string): OpsResult {
  const target = data.days.find((d) => d.id === dayId);
  if (!target) return result(data, data, []);
  const trimmed = name.trim().slice(0, 50) || undefined;
  if (target.name === trimmed) return result(data, data, []);
  return result(data, {
    ...data,
    days: data.days.map((d) => (d.id === dayId ? { ...d, name: trimmed } : d)),
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
    // 继承被移走站点原前后段的出行方式（来源段仍存在于原始 data.segments）
    const reconnectMode: Mode =
      data.segments.find((s) => s.fromStop === prev.id && s.toStop === stopId)?.mode
      ?? data.segments.find((s) => s.fromStop === stopId && s.toStop === next.id)?.mode
      ?? "driving";
    const seg = autoSegment(prev, next, reconnectMode);
    segments.push(seg);
    needed.push(segmentRequest(seg));
  }

  const targetSorted = [...data.stops.filter((s) => s.dayId === dayId).sort((a, b) => a.order - b.order), stop];
  if (targetSorted.length >= 2) {
    const a = targetSorted[targetSorted.length - 2];
    const b = stop;
    // 新尾部段继承站点原有的到达/出发方式
    const carriedMode: Mode =
      data.segments.find((s) => s.toStop === stopId)?.mode
      ?? data.segments.find((s) => s.fromStop === stopId)?.mode
      ?? "driving";
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
