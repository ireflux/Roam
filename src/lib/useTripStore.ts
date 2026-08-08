"use client";

import { create } from "zustand";
import type { AmapMap } from "@/lib/mapTypes";
import type { Mode, Position, SegmentPart, Trip, TripData } from "@/lib/types";
import {
  addDay as opAddDay,
  addStop as opAddStop,
  applyFallbackLine,
  applyRoute,
  backfillDayNames,
  completeFreehand as opCompleteFreehand,
  markSegmentSnapped,
  moveStopToDay as opMoveStopToDay,
  removeDay as opRemoveDay,
  removeStop as opRemoveStop,
  renameDay as opRenameDay,
  reorderDays as opReorderDays,
  reorderStops as opReorderStops,
  repairSegmentIds,
  segmentRequest,
  setSegmentMode as opSetSegmentMode,
  updateSegmentVertex,
  updateStop as opUpdateStop,
  type SegmentRequest,
} from "@/lib/trip/ops";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "offline";
export type Tool = "select" | "add" | "draw" | "snap";
export type SegState = "pending" | "ok" | "error";

interface TripState {
  trip: Trip | null;
  status: SaveStatus;
  map: AmapMap | null;
  tool: Tool;
  currentMode: Mode;
  selectedStopId: string | null;
  selectedSegId: string | null;
  segState: Record<string, SegState>;
  canUndo: boolean;
  canRedo: boolean;
  /** 绘制/改线时地图是否允许用户解锁平移（默认锁定）。 */
  mapUnlocked: boolean;

  load: (trip: Trip) => void;
  setMap: (map: AmapMap | null) => void;
  setTool: (tool: Tool) => void;
  setMapUnlocked: (v: boolean) => void;
  setCurrentMode: (mode: Mode) => void;
  selectStop: (id: string | null) => void;
  selectSeg: (id: string | null) => void;

  setTitle: (title: string) => void;
  addStopAt: (input: { dayId?: string; name: string; lat: number; lng: number; mode: Mode }) => string | undefined;
  setStopName: (stopId: string, name: string) => void;
  removeStop: (stopId: string) => void;
  reorder: (dayId: string, fromIdx: number, toIdx: number) => void;
  setMode: (segId: string, mode: Mode) => void;
  runNeeded: (needed: SegmentRequest[]) => void;
  retrySegment: (segId: string) => void;
  completeFreehand: (points: Position[], mode: Mode) => void;
  moveVertex: (segId: string, vertexIndex: number, position: Position, commit: boolean) => void;
  addDay: () => void;
  removeDay: (dayId: string) => void;
  renameDay: (dayId: string, name: string) => void;
  reorderDays: (fromIdx: number, toIdx: number) => void;
  moveStopToDay: (stopId: string, dayId: string) => void;
  updateStop: (stopId: string, patch: { name?: string; note?: string; category?: string }) => void;
  undo: () => void;
  redo: () => void;
  /** 撤销最近一次「删除停留点」（toast 上的撤销按钮）。无待撤销删除或期间发生其他修改时返回 false。 */
  undoDelete: () => boolean;

  save: () => Promise<void>;
}

const UNDO_LIMIT = 50;
const SAVE_DEBOUNCE_MS = 1500;
const ROUTE_CONCURRENCY = 3;

const undoStack: TripData[] = [];
const redoStack: TripData[] = [];

/**
 * 最近一次「删除停留点」的撤销上下文（toast 撤销专用，独立于全局 undo 栈）：
 * - snapshot：删除前的数据引用（ops 全程不可变，引用即快照，O(1)）；
 * - mark：删除时注册撤销栈的水位。撤销前校验栈水位未变 + 重做栈为空，
 *   避免撤销窗口内用户的其他操作被误回退。
 */
let pendingDelete: { snapshot: TripData; mark: number } | null = null;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveInFlight = false;
let saveTriggeredDuringSave = false;

function clearSaveTimer() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

/**
 * 结构性共享：ops 全部不可变（见 ops.ts 头注释），历史版本可安全持有引用，
 * 无需深拷贝。undo/redo 为 O(1)，内存成本仅为共享子树。
 */
function pushHistory(data: TripData) {
  undoStack.push(data);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  useTripStore.setState({ canUndo: undoStack.length > 0, canRedo: false });
}

function syncHistoryFlags() {
  useTripStore.setState({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });
}

/** 标记脏状态并防抖调度保存；若正在保存则置位 saveTriggeredDuringSave，由保存循环兜底补存，绝不丢变更。 */
function scheduleSave(get: () => TripState, delay = SAVE_DEBOUNCE_MS) {
  if (saveTimer) clearTimeout(saveTimer);
  useTripStore.setState({ status: "dirty" });
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushSave(get);
  }, delay);
}

/** 保存循环：并发触发只排队一次；完成后若期间有新变更（dirty 或排队标志）则立即补存。 */
async function flushSave(get: () => TripState): Promise<void> {
  if (saveInFlight) {
    saveTriggeredDuringSave = true;
    return;
  }
  saveInFlight = true;
  saveTriggeredDuringSave = false;
  try {
    const { trip } = get();
    if (!trip) return;
    const payload = trip.data;
    const title = trip.title ?? "";
    useTripStore.setState({ status: "saving" });
    const res = await fetch(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: payload, title }),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    const { updatedAt } = await res.json();
    useTripStore.setState((s) => {
      if (!s.trip) return { status: "saved" };
      const changedDuringSave = s.trip.data !== payload;
      return {
        status: changedDuringSave ? "dirty" : "saved",
        trip: { ...s.trip, updatedAt },
      };
    });
  } catch {
    useTripStore.setState({ status: "error" });
  } finally {
    saveInFlight = false;
    if (saveTriggeredDuringSave) {
      saveTriggeredDuringSave = false;
      void flushSave(get);
    }
  }
}

/** 路由请求响应守卫：仅当该段仍存在、模式与端点未变时才应用结果，防止过期响应覆盖新数据。 */
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
    map: null,
    tool: "select",
    currentMode: "driving",
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
      // 旧数据兼容（见 ops.ts）：补齐天名 + 修复历史重复段 id
      let data = trip.data;
      if (data.days.some((d) => !d.name)) {
        data = { ...data, days: backfillDayNames(data.days) };
      }
      data = repairSegmentIds(data);
      const hydrated = data !== trip.data ? { ...trip, data } : trip;
      set({
        trip: hydrated,
        status: "idle",
        segState: {},
        selectedStopId: null,
        selectedSegId: null,
        canUndo: false,
        canRedo: false,
      });
    },

    setMap: (map) => set({ map }),

    setTool: (tool) => set({ tool, selectedStopId: null, selectedSegId: null, mapUnlocked: false }),

    setCurrentMode: (mode) => set({ currentMode: mode }),
    setMapUnlocked: (v) => set({ mapUnlocked: v }),

    selectStop: (id) => set({ selectedStopId: id, selectedSegId: null }),
    selectSeg: (id) => set({ selectedSegId: id, selectedStopId: null }),

    setTitle: (title) => {
      // 标题是元数据，不进 undo/redo；保留防抖自动保存
      const { trip } = get();
      if (!trip) return;
      set({ trip: { ...trip, title } });
      scheduleSave(get);
    },

    addStopAt: (input) => {
      const { trip } = get();
      if (!trip) return undefined;
      pushHistory(trip.data);
      const dayId = input.dayId ?? trip.data.days[0]?.id ?? "d1";
      const res = opAddStop(trip.data, { ...input, dayId });
      const newStopId =
        res.addedId ??
        res.data.stops.find((s) => s.dayId === dayId && s.lat === input.lat && s.lng === input.lng)?.id;
      set({ trip: { ...trip, data: res.data } });
      scheduleSave(get);
      if (res.needed.length > 0) get().runNeeded(res.needed);
      return newStopId;
    },

    /** 逆地理编码等自动命名：不进 undo/redo（避免污染撤销栈），保留自动保存。 */
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

    removeStop: (stopId) => {
      const { trip } = get();
      if (!trip) return;
      const snapshot = trip.data;
      pushHistory(snapshot);
      const res = opRemoveStop(snapshot, stopId);
      if (!res.changed) return;
      pendingDelete = { snapshot, mark: undoStack.length };
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

      /** 过期/失效请求的清理：清除 pending 状态，避免段永久卡在加载态。 */
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
          const res = await fetch("/api/route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: req.mode, from: req.from, to: req.to }),
          });
          const json = (await res.json()) as
            | { geometry: Position[]; distanceM: number; durationMin: number; fallback?: boolean; parts?: SegmentPart[] }
            | { error: string; fallback?: { geometry: Position[]; distanceM: number; durationMin: number; parts?: SegmentPart[] } };
          if (!isRequestCurrent(get, req)) {
            clearSegState(req.segId);
            return;
          }
          const current = get().trip;
          if (!current) return;
          if ("error" in json && json.error) {
            const fb = "fallback" in json ? json.fallback : undefined;
            const fallbackData = fb
              ? applyFallbackLine(current.data, req.segId, fb)
              : current.data;
            set((s) => ({
              trip: { ...current, data: fallbackData },
              segState: { ...s.segState, [req.segId]: "error" },
            }));
            scheduleSave(get);
          } else {
            const r = json as { geometry: Position[]; distanceM: number; durationMin: number; parts?: SegmentPart[] };
            const data = applyRoute(current.data, req.segId, r);
            set((s) => ({
              trip: { ...current, data },
              segState: { ...s.segState, [req.segId]: "ok" },
            }));
            scheduleSave(get);
          }
        } catch {
          if (!isRequestCurrent(get, req)) {
            clearSegState(req.segId);
            return;
          }
          const current = get().trip;
          if (!current) return;
          const fb = {
            geometry: [req.from, req.to],
            distanceM: 0,
            durationMin: 0,
          };
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

    completeFreehand: (points, mode) => {
      const { trip } = get();
      if (!trip) return;
      pushHistory(trip.data);
      const res = opCompleteFreehand(trip.data, points, mode);
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
      set({ trip: { ...trip, data: res.data } });
      scheduleSave(get);
    },

    removeDay: (dayId) => {
      const { trip } = get();
      if (!trip) return;
      pushHistory(trip.data);
      const res = opRemoveDay(trip.data, dayId);
      set({ trip: { ...trip, data: res.data } });
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

    updateStop: (stopId, patch) => {
      const { trip } = get();
      if (!trip) return;
      pushHistory(trip.data);
      const data = opUpdateStop(trip.data, stopId, patch);
      set({ trip: { ...trip, data } });
      scheduleSave(get);
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
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(trip.data);
      set({ trip: { ...trip, data: next } });
      syncHistoryFlags();
      scheduleSave(get);
    },

    undoDelete: () => {
      if (!pendingDelete) return false;
      const { snapshot, mark } = pendingDelete;
      pendingDelete = null;
      const { trip } = get();
      if (!trip) return false;
      // 撤销窗口内若已发生其他用户操作（撤销栈水位变化或重做栈非空），
      // 拒绝恢复快照，避免覆盖新改动。
      if (undoStack.length !== mark || redoStack.length !== 0) return false;
      undoStack.pop();
      set({ trip: { ...trip, data: snapshot }, selectedStopId: null });
      syncHistoryFlags();
      scheduleSave(get);
      return true;
    },

    save: () => flushSave(get),
  }));
