import { nanoid } from "nanoid";
import type {
  Mode,
  Position,
  TripData,
  TripDay,
  TripSegment,
  TripStop,
} from "@/lib/types";
import { roughDistanceM } from "@/lib/trip/geo";

export interface SegmentRequest {
  segId: string;
  mode: Mode;
  from: Position;
  to: Position;
}

export interface OpsResult {
  data: TripData;
  needed: SegmentRequest[];
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
    return {
      data: {
        ...withDay,
        stops: [...withDay.stops, stop],
        segments: [...withDay.segments, seg],
      },
      needed,
    };
  }
  return { data: { ...withDay, stops: [...withDay.stops, stop] }, needed };
}

export function removeStop(data: TripData, stopId: string): OpsResult {
  const stop = data.stops.find((s) => s.id === stopId);
  if (!stop) return { data, needed: [] };
  const dayStops = stopsOfDay(data, stop.dayId);
  const idx = dayStops.findIndex((s) => s.id === stopId);
  const prev = idx > 0 ? dayStops[idx - 1] : null;
  const next = idx < dayStops.length - 1 ? dayStops[idx + 1] : null;

  const rest = data.segments.filter((s) => s.fromStop !== stopId && s.toStop !== stopId);
  const needed: SegmentRequest[] = [];

  if (prev && next) {
    const inheritMode: Mode =
      rest.find((s) => s.fromStop === prev.id && s.toStop === stopId)?.mode ?? "driving";
    const seg = autoSegment(prev, next, inheritMode);
    needed.push(segmentRequest(seg));
    return {
      data: {
        ...data,
        stops: data.stops
          .filter((s) => s.id !== stopId)
          .map((s) =>
            s.dayId === stop.dayId && s.order > stop.order ? { ...s, order: s.order - 1 } : s,
          ),
        segments: [...rest, seg],
      },
      needed,
    };
  }

  return {
    data: {
      ...data,
      stops: data.stops
        .filter((s) => s.id !== stopId)
        .map((s) =>
          s.dayId === stop.dayId && s.order > stop.order ? { ...s, order: s.order - 1 } : s,
        ),
      segments: rest,
    },
    needed,
  };
}

export function reorderStops(data: TripData, dayId: string, fromIdx: number, toIdx: number): OpsResult {
  const dayStops = stopsOfDay(data, dayId);
  if (fromIdx === toIdx || fromIdx < 0 || fromIdx >= dayStops.length || toIdx < 0 || toIdx >= dayStops.length) {
    return { data, needed: [] };
  }
  const reordered = [...dayStops];
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, moved);
  const newOrder = new Map(reordered.map((s, i) => [s.id, i]));

  const stops = data.stops.map((s) =>
    newOrder.has(s.id) ? { ...s, order: newOrder.get(s.id)! } : s,
  );
  const nextData = { ...data, stops };

  const needed: SegmentRequest[] = [];
  const restSegments = nextData.segments.filter(
    (s) => !dayStops.some((d) => s.fromStop === d.id || s.toStop === d.id),
  );
  const segments: TripSegment[] = [...restSegments];

  for (let i = 0; i < reordered.length - 1; i++) {
    const a = reordered[i];
    const b = reordered[i + 1];
    const existing = nextData.segments.find(
      (s) => s.fromStop === a.id && s.toStop === b.id,
    );
    if (existing && existing.kind === "freehand") {
      segments.push({ ...existing, kind: "auto", geometry: { type: "LineString", coordinates: [posOf(a), posOf(b)] }, distanceM: roughDistanceM(posOf(a), posOf(b)), durationMin: 0 });
      needed.push(segmentRequest({ ...existing, kind: "auto", mode: existing.mode }));
    } else if (existing && existing.kind === "auto") {
      segments.push({ ...existing, geometry: { type: "LineString", coordinates: [posOf(a), posOf(b)] }, distanceM: roughDistanceM(posOf(a), posOf(b)), durationMin: 0 });
      needed.push(segmentRequest(existing));
    } else {
      const seg = autoSegment(a, b, existing?.mode ?? "driving");
      segments.push(seg);
      needed.push(segmentRequest(seg));
    }
  }

  return { data: { ...nextData, segments }, needed };
}

export function setSegmentMode(data: TripData, segId: string, mode: Mode): OpsResult {
  const seg = data.segments.find((s) => s.id === segId);
  if (!seg) return { data, needed: [] };
  if (seg.kind !== "auto") {
    return {
      data: { ...data, segments: data.segments.map((s) => (s.id === segId ? { ...s, mode, kind: "auto" as const } : s)) },
      needed: [],
    };
  }
  const updated: TripSegment = { ...seg, mode, kind: "auto", durationMin: 0 };
  return {
    data: { ...data, segments: data.segments.map((s) => (s.id === segId ? updated : s)) },
    needed: [segmentRequest(updated)],
  };
}

export function applyRoute(
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
            kind: "auto" as const,
            geometry: { type: "LineString" as const, coordinates: result.geometry },
            distanceM: result.distanceM,
            durationMin: result.durationMin,
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
  if (points.length < 2) return { data, needed: [] };
  const first = points[0];
  const last = points[points.length - 1];
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
    geometry: { type: "LineString", coordinates: points },
    distanceM: roughDistanceM(first, last),
    durationMin: 0,
  };
  return {
    data: { ...data, stops: [...data.stops, ...newStops], segments: [...data.segments, seg] },
    needed: [],
  };
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
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const out: Position[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(coords[Math.round(i * step)]);
  }
  return out;
}

export function addDay(data: TripData): OpsResult {
  const day: TripDay = { id: nanoid(10), name: `第 ${data.days.length + 1} 天` };
  return { data: { ...data, days: [...data.days, day] }, needed: [] };
}

export function removeDay(data: TripData, dayId: string): OpsResult {
  if (data.days.length <= 1) return { data, needed: [] };
  const dayStopIds = new Set(data.stops.filter((s) => s.dayId === dayId).map((s) => s.id));
  return {
    data: {
      ...data,
      days: data.days.filter((d) => d.id !== dayId),
      stops: data.stops.filter((s) => s.dayId !== dayId),
      segments: data.segments.filter(
        (s) => !dayStopIds.has(s.fromStop) && !dayStopIds.has(s.toStop),
      ),
    },
    needed: [],
  };
}

export function moveStopToDay(data: TripData, stopId: string, dayId: string): OpsResult {
  const stop = data.stops.find((s) => s.id === stopId);
  const day = data.days.find((d) => d.id === dayId);
  if (!stop || !day || stop.dayId === dayId) return { data, needed: [] };
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
    const seg = autoSegment(prev, next, "driving");
    segments.push(seg);
    needed.push(segmentRequest(seg));
  }

  const targetSorted = [...data.stops.filter((s) => s.dayId === dayId).sort((a, b) => a.order - b.order), stop];
  if (targetSorted.length >= 2) {
    const a = targetSorted[targetSorted.length - 2];
    const b = stop;
    const seg = autoSegment(a, b, "driving");
    segments.push(seg);
    needed.push(segmentRequest(seg));
  }

  return { data: { ...data, stops, segments }, needed };
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
