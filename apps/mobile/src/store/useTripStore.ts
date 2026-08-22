import { create } from "zustand";
import type { Mode, Position, SegmentPart, Trip, TripData } from "@roam/core";
import {
  addDay as opAddDay,
  addStop as opAddStop,
  applyFallbackLine,
  applyRoute,
  backfillDayNames,
  completeFreehand as opCompleteFreehand,
  markSegmentSnapped,
  moveStopToDay as opMoveStopToDay,
  nextActiveAfterDayRemoved,
  removeDay as opRemoveDay,
  removeStop as opRemoveStop,
  renameDay as opRenameDay,
  reorderDays as opReorderDays,
  reorderStops as opReorderStops,
  repairSegmentIds,
  segmentRequest,
  setDayDate as opSetDayDate,
  setSegmentMode as opSetSegmentMode,
  updateSegmentVertex,
  updateStop as opUpdateStop,
  type SegmentRequest,
} from "@roam/core";
import { api } from "@/lib/env";
import { tripDb } from "@/services/db";
import { pushDirty } from "@/services/sync";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "offline" | "conflict";
export type Tool = "select" | "add" | "draw" | "snap";
export type SegState = "pending" | "ok" | "error";

interface TripState {
  trip: Trip | null;
  status: SaveStatus;
  conflict: { serverUpdatedAt: string } | null;
  tool: Tool;
  activeDayId: string | null;
  selectedStopId: string | null;
  selectedSegId: string | null;
  segState: Record<string, SegState>;
  canUndo: boolean;
  canRedo: boolean;
  mapUnlocked: boolean;

  load: (trip: Trip) => void;
  createLocal: (title?: string) => Promise<string>;
  setTool: (tool: Tool) => void;
  setMapUnlocked: (v: boolean) => void;
  setActiveDayId: (dayId: string | null) => void;
  selectStop: (id: string | null) => void;
  selectSeg: (id: string | null) => void;

  setTitle: (title: string) => void;
  addStopAt: (input: { dayId?: string; name: string; lat: number; lng: number }) => string | undefined;
  setStopName: (stopId: string, name: string) => void;
  updateStop: (stopId: string, patch: { name?: string; note?: string; category?: string }) => void;
  removeStop: (stopId: string) => void;
  reorder: (dayId: string, fromIdx: number, toIdx: number) => void;
  setMode: (segId: string, mode: Mode) => void;
  runNeeded: (needed: SegmentRequest[]) => void;
  retrySegment: (segId: string) => void;
  completeFreehand: (points: Position[]) => void;
  moveVertex: (segId: string, vertexIndex: number, position: Position, commit: boolean) => void;
  addDay: () => void;
  removeDay: (dayId: string) => void;
  renameDay: (dayId: string, name: string) => void;
  setDayDate: (dayId: string, date: string | null) => void;
  reorderDays: (fromIdx: number, toIdx: number) => void;
  moveStopToDay: (stopId: string, dayId: string) => void;
  undo: () => void;
  redo: () => void;

  /** 立即推送（跳过防抖）。 */
  flushNow: () => Promise<void>;
}

const UNDO_LIMIT = 50;
const SAVE_DEBOUNCE_MS = 1500;
const ROUTE_CONCURRENCY = 3;

const undoStack: TripData[] = [];
const redoStack: TripData[] = [];

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function clearSaveTimer() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

/** 本地优先：每次变更立即落库（dirty=1），防抖后由 sync 服务推送到服务端。 */
async function persistLocal(trip: Trip): Promise<void> {
  await tripDb.upsertLocal({
    id: trip.id,
    shareId: trip.shareId || null,
    title: trip.title ?? null,
    data: trip.data,
    dirty: true,
  });
}

function scheduleSave(get: () => TripState, delay = SAVE_DEBOUNCE_MS) {
  if (saveTimer) clearTimeout(saveTimer);
  useTripStore.setState({ status: "dirty" });
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushSave(get);
  }, delay);
}

async function flushSave(get: () => TripState): Promise<void> {
  const { trip } = get();
  if (!trip) return;
  useTripStore.setState({ status: "saving" });
  await persistLocal(trip);
  const { conflicts } = await pushDirty();
  const latest = get();
  if (!latest.trip || latest.trip.id !== trip.id) return;
  if (conflicts > 0 && latest.trip.id === trip.id) {
    useTripStore.setState({ status: "conflict" });
  } else if (latest.status === "saving") {
    useTripStore.setState({
      status: latest.trip.data !== trip.data ? "dirty" : "saved",
    });
  }
}

/** 结构性共享：ops 全程不可变，历史版本持有引用即可，undo/redo O(1)。 */
function pushHistory(data: TripData) {
  undoStack.push(data);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  useTripStore.setState({ canUndo: true, canRedo: false });
}

function syncHistoryFlags() {
  useTripStore.setState({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });
}

/** 路由请求响应守卫：段仍存在且模式/端点未变时才应用结果。 */
function isRequestCurrent(get: () => TripState, req: SegmentRequest): boolean {
  const { trip } = get();
  if (!trip) return false;
  const seg = trip.data.segments.find((s) => s.id === req.segId);
  if (!seg || seg.mode !== req.mode) return false;
  const coords = seg.geometry.coordinates;
  const same = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];
  if (coords.length < 2 || !same(coords[0], req.from) || !same(coords[coords.length - 1], req.to)) return false;
  return true;
}

export const useTripStore = create<TripState>((set, get) => ({
  trip: null,
  status: "idle",
  conflict: null,
  tool: "select",
  activeDayId: null,
  selectedStopId: null,
  selectedSegId: null,
  segState: {},
  canUndo: false,
  canRedo: false,
  mapUnlocked: false,

  load: (trip) => {
    clearSaveTimer();
    undoStack.length = 0;
    redoStack.length = 0;
    let data = trip.data;
    if (data.days.some((d) => !d.name)) {
      data = { ...data, days: backfillDayNames(data.days) };
    }
    data = repairSegmentIds(data);
    const hydrated = data !== trip.data ? { ...trip, data } : trip;
    set({
      trip: hydrated,
      status: "idle",
      conflict: null,
      activeDayId: hydrated.data.days[0]?.id ?? null,
      segState: {},
      selectedStopId: null,
      selectedSegId: null,
      canUndo: false,
      canRedo: false,
    });
  },

  createLocal: async (title) => {
    const now = new Date().toISOString();
    const trip: Trip = {
      id: crypto.randomUUID(),
      shareId: "",
      ownerId: "",
      title: title?.trim() || null,
      createdAt: now,
      updatedAt: now,
      data: repairSegmentIds({ days: [], stops: [], segments: [] }),
    };
    clearSaveTimer();
    undoStack.length = 0;
    redoStack.length = 0;
    await persistLocal(trip);
    set({
      trip,
      status: "dirty",
      conflict: null,
      activeDayId: null,
      segState: {},
      selectedStopId: null,
      selectedSegId: null,
      canUndo: false,
      canRedo: false,
    });
    scheduleSave(get, 0); // 新行程尽快建档到服务端
    return trip.id;
  },

  setTool: (tool) => set({ tool, selectedStopId: null, selectedSegId: null, mapUnlocked: false }),
  setMapUnlocked: (v) => set({ mapUnlocked: v }),
  setActiveDayId: (dayId) => set({ activeDayId: dayId }),
  selectStop: (id) => set({ selectedStopId: id, selectedSegId: null }),
  selectSeg: (id) => set({ selectedSegId: id, selectedStopId: null }),

  setTitle: (title) => {
    const { trip } = get();
    if (!trip) return;
    set({ trip: { ...trip, title } });
    scheduleSave(get);
  },

  addStopAt: (input) => {
    const { trip, activeDayId } = get();
    if (!trip) return undefined;
    pushHistory(trip.data);
    const dayId = input.dayId ?? activeDayId ?? trip.data.days[0]?.id ?? "d1";
    const res = opAddStop(trip.data, { ...input, dayId });
    const newStopId =
      res.addedId ??
      res.data.stops.find((s) => s.dayId === dayId && s.lat === input.lat && s.lng === input.lng)?.id;
    set({ trip: { ...trip, data: res.data } });
    scheduleSave(get);
    if (res.needed.length > 0) get().runNeeded(res.needed);
    return newStopId;
  },

  /** 自动命名等元数据写入不进 undo 栈。 */
  setStopName: (stopId, name) => {
    const { trip } = get();
    if (!trip) return;
    const trimmed = name.trim().slice(0, 100);
    if (!trimmed) return;
    const current = trip.data.stops.find((s) => s.id === stopId);
    if (!current || current.name) return;
    set({
      trip: {
        ...trip,
        data: { ...trip.data, stops: trip.data.stops.map((s) => (s.id === stopId ? { ...s, name: trimmed } : s)) },
      },
    });
    scheduleSave(get);
  },

  updateStop: (stopId, patch) => {
    const { trip } = get();
    if (!trip) return;
    pushHistory(trip.data);
    const data = opUpdateStop(trip.data, stopId, patch);
    set({ trip: { ...trip, data } });
    scheduleSave(get);
  },

  removeStop: (stopId) => {
    const { trip } = get();
    if (!trip) return;
    const res = opRemoveStop(trip.data, stopId);
    if (!res.changed) return;
    pushHistory(trip.data);
    set({ trip: { ...trip, data: res.data }, selectedStopId: null });
    scheduleSave(get);
    if (res.needed.length > 0) get().runNeeded(res.needed);
  },

  reorder: (dayId, fromIdx, toIdx) => {
    const { trip } = get();
    if (!trip) return;
    const res = opReorderStops(trip.data, dayId, fromIdx, toIdx);
    if (!res.changed) return;
    pushHistory(trip.data);
    set({ trip: { ...trip, data: res.data } });
    scheduleSave(get);
    if (res.needed.length > 0) get().runNeeded(res.needed);
  },

  setMode: (segId, mode) => {
    const { trip } = get();
    if (!trip) return;
    pushHistory(trip.data);
    const res = opSetSegmentMode(trip.data, segId, mode);
    set({ trip: { ...trip, data: res.data } });
    scheduleSave(get);
    if (res.needed.length > 0) get().runNeeded(res.needed);
  },

  runNeeded: (needed) => {
    const queue = [...needed];
    let active = 0;

    const clearSegState = (segId: string) => {
      set((s) => {
        if (!(segId in s.segState)) return {};
        const rest = { ...s.segState };
        delete rest[segId];
        return { segState: rest };
      });
    };

    const handle = async (req: SegmentRequest) => {
      const { trip } = get();
      if (!trip) return;
      set((s) => ({ segState: { ...s.segState, [req.segId]: "pending" } }));
      try {
        const r = await api().planRoute({ mode: req.mode, from: req.from, to: req.to });
        if (!isRequestCurrent(get, req)) {
          clearSegState(req.segId);
          return;
        }
        const current = get().trip;
        if (!current) return;
        const data = applyRoute(current.data, req.segId, r);
        set((s) => ({
          trip: { ...current, data },
          segState: { ...s.segState, [req.segId]: "ok" },
        }));
        scheduleSave(get);
      } catch {
        if (!isRequestCurrent(get, req)) {
          clearSegState(req.segId);
          return;
        }
        const current = get().trip;
        if (!current) return;
        // 网络失败/服务端错误 → 直线降级 + error 徽章（与 Web 行为一致）
        const fb = { geometry: [req.from, req.to], distanceM: 0, durationMin: 0 };
        const data = applyFallbackLine(current.data, req.segId, fb);
        set((s) => ({
          trip: { ...current, data },
          segState: { ...s.segState, [req.segId]: "error" },
        }));
        scheduleSave(get);
      } finally {
        active -= 1;
        next();
      }
    };

    const next = () => {
      while (active < ROUTE_CONCURRENCY && queue.length > 0) {
        const req = queue.shift()!;
        active += 1;
        void handle(req);
      }
    };

    next();
  },

  retrySegment: (segId) => {
    const { trip } = get();
    if (!trip) return;
    const seg = trip.data.segments.find((s) => s.id === segId);
    if (!seg) return;
    get().runNeeded([segmentRequest(seg)]);
  },

  completeFreehand: (points) => {
    const { trip, activeDayId } = get();
    if (!trip) return;
    pushHistory(trip.data);
    const res = opCompleteFreehand(trip.data, points, activeDayId ?? undefined);
    set({ trip: { ...trip, data: res.data } });
    scheduleSave(get);
  },

  moveVertex: (segId, vertexIndex, position, commit) => {
    const { trip } = get();
    if (!trip) return;
    if (commit) pushHistory(trip.data);
    const data = commit
      ? markSegmentSnapped(updateSegmentVertex(trip.data, segId, vertexIndex, position), segId)
      : updateSegmentVertex(trip.data, segId, vertexIndex, position);
    set({ trip: { ...trip, data } });
    if (commit) scheduleSave(get);
  },

  addDay: () => {
    const { trip } = get();
    if (!trip) return;
    pushHistory(trip.data);
    const res = opAddDay(trip.data);
    set({ trip: { ...trip, data: res.data }, activeDayId: res.addedId ?? null });
    scheduleSave(get);
  },

  removeDay: (dayId) => {
    const { trip, activeDayId } = get();
    if (!trip) return;
    pushHistory(trip.data);
    const res = opRemoveDay(trip.data, dayId);
    if (!res.changed) return;
    set({
      trip: { ...trip, data: res.data },
      activeDayId: nextActiveAfterDayRemoved(trip.data.days, dayId, activeDayId),
    });
    scheduleSave(get);
  },

  renameDay: (dayId, name) => {
    const { trip } = get();
    if (!trip) return;
    const res = opRenameDay(trip.data, dayId, name);
    if (!res.changed) return;
    pushHistory(trip.data);
    set({ trip: { ...trip, data: res.data } });
    scheduleSave(get);
  },

  setDayDate: (dayId, date) => {
    const { trip } = get();
    if (!trip) return;
    const res = opSetDayDate(trip.data, dayId, date);
    if (!res.changed) return;
    pushHistory(trip.data);
    set({ trip: { ...trip, data: res.data } });
    scheduleSave(get);
  },

  reorderDays: (fromIdx, toIdx) => {
    const { trip } = get();
    if (!trip) return;
    const res = opReorderDays(trip.data, fromIdx, toIdx);
    if (!res.changed) return;
    pushHistory(trip.data);
    set({ trip: { ...trip, data: res.data } });
    scheduleSave(get);
  },

  moveStopToDay: (stopId, dayId) => {
    const { trip } = get();
    if (!trip) return;
    const res = opMoveStopToDay(trip.data, stopId, dayId);
    if (!res.changed) return;
    pushHistory(trip.data);
    set({ trip: { ...trip, data: res.data } });
    scheduleSave(get);
    if (res.needed.length > 0) get().runNeeded(res.needed);
  },

  undo: () => {
    const { trip } = get();
    if (!trip) return;
    const prev = undoStack.pop();
    if (!prev) return;
    redoStack.push(trip.data);
    set({ trip: { ...trip, data: prev } });
    syncHistoryFlags();
    scheduleSave(get);
  },

  redo: () => {
    const { trip } = get();
    if (!trip) return;
    const nextData = redoStack.pop();
    if (!nextData) return;
    undoStack.push(trip.data);
    set({ trip: { ...trip, data: nextData } });
    syncHistoryFlags();
    scheduleSave(get);
  },

  flushNow: async () => {
    clearSaveTimer();
    await flushSave(get);
  },
}));
