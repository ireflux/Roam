"use client";

import { create } from "zustand";
import type { MaplibreMap } from "@/lib/mapTypes";
import type { Mode, Position, Trip, TripData } from "@/lib/types";
import {
  addDay as opAddDay,
  addStop as opAddStop,
  applyFallbackLine,
  applyRoute,
  completeFreehand as opCompleteFreehand,
  markSegmentSnapped,
  moveStopToDay as opMoveStopToDay,
  removeDay as opRemoveDay,
  removeStop as opRemoveStop,
  reorderStops as opReorderStops,
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
  map: MaplibreMap | null;
  tool: Tool;
  currentMode: Mode;
  selectedStopId: string | null;
  selectedSegId: string | null;
  segState: Record<string, SegState>;
  canUndo: boolean;
  canRedo: boolean;

  load: (trip: Trip) => void;
  setMap: (map: MaplibreMap | null) => void;
  setTool: (tool: Tool) => void;
  setCurrentMode: (mode: Mode) => void;
  selectStop: (id: string | null) => void;
  selectSeg: (id: string | null) => void;

  patchData: (data: TripData) => void;
  setTitle: (title: string) => void;
  addStopAt: (input: { dayId?: string; name: string; lat: number; lng: number; mode: Mode }) => void;
  removeStop: (stopId: string) => void;
  reorder: (dayId: string, fromIdx: number, toIdx: number) => void;
  setMode: (segId: string, mode: Mode) => void;
  runNeeded: (needed: SegmentRequest[]) => void;
  completeFreehand: (points: Position[], mode: Mode) => void;
  moveVertex: (segId: string, vertexIndex: number, position: Position, commit: boolean) => void;
  addDay: () => void;
  removeDay: (dayId: string) => void;
  moveStopToDay: (stopId: string, dayId: string) => void;
  updateStop: (stopId: string, patch: { name?: string; note?: string; category?: string }) => void;
  undo: () => void;
  redo: () => void;

  save: (data?: TripData) => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const UNDO_LIMIT = 50;
const undoStack: TripData[] = [];
const redoStack: TripData[] = [];

function pushHistory(data: TripData) {
  undoStack.push(JSON.parse(JSON.stringify(data)) as TripData);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  useTripStore.setState({ canUndo: undoStack.length > 0, canRedo: false });
}

function syncHistoryFlags() {
  useTripStore.setState({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });
}

function scheduleSave(get: () => TripState) {
  if (saveTimer) clearTimeout(saveTimer);
  useTripStore.setState({ status: "dirty" });
  saveTimer = setTimeout(() => void get().save(), 1500);
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

    load: (trip) => set({ trip, status: "idle" }),

    setMap: (map) => set({ map }),

    setTool: (tool) => set({ tool, selectedStopId: null, selectedSegId: null }),

    setCurrentMode: (mode) => set({ currentMode: mode }),

    selectStop: (id) => set({ selectedStopId: id, selectedSegId: null }),
    selectSeg: (id) => set({ selectedSegId: id, selectedStopId: null }),

    patchData: (data) => {
      const { trip } = get();
      if (!trip) return;
      pushHistory(trip.data);
      set({ trip: { ...trip, data } });
      scheduleSave(get);
    },

    setTitle: (title) => {
      const { trip } = get();
      if (!trip) return;
      pushHistory(trip.data);
      set({ trip: { ...trip, title } });
      scheduleSave(get);
    },

    addStopAt: (input) => {
      const { trip } = get();
      if (!trip) return;
      pushHistory(trip.data);
      const dayId = input.dayId ?? trip.data.days[0]?.id ?? "d1";
      const res = opAddStop(trip.data, { ...input, dayId });
      set({ trip: { ...trip, data: res.data }, tool: "select" });
      scheduleSave(get);
      if (res.needed.length > 0) get().runNeeded(res.needed);
    },

    removeStop: (stopId) => {
      const { trip } = get();
      if (!trip) return;
      pushHistory(trip.data);
      const res = opRemoveStop(trip.data, stopId);
      set({ trip: { ...trip, data: res.data }, selectedStopId: null });
      scheduleSave(get);
      if (res.needed.length > 0) get().runNeeded(res.needed);
    },

    reorder: (dayId, fromIdx, toIdx) => {
      const { trip } = get();
      if (!trip) return;
      const res = opReorderStops(trip.data, dayId, fromIdx, toIdx);
      if (res.data === trip.data) return;
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
      void (async () => {
        while (queue.length > 0) {
          const req = queue.shift()!;
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
              | { geometry: [number, number][]; distanceM: number; durationMin: number; fallback?: boolean }
              | { error: string; fallback?: { geometry: [number, number][]; distanceM: number; durationMin: number } };
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
              const r = json as { geometry: [number, number][]; distanceM: number; durationMin: number };
              const data = applyRoute(current.data, req.segId, r);
              set((s) => ({
                trip: { ...current, data },
                segState: { ...s.segState, [req.segId]: "ok" },
              }));
              scheduleSave(get);
            }
          } catch {
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
          }
        }
      })();
    },

    completeFreehand: (points, mode) => {
      const { trip } = get();
      if (!trip) return;
      pushHistory(trip.data);
      const res = opCompleteFreehand(trip.data, points, mode);
      set({ trip: { ...trip, data: res.data }, tool: "select" });
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

    moveStopToDay: (stopId, dayId) => {
      const { trip } = get();
      if (!trip) return;
      pushHistory(trip.data);
      const res = opMoveStopToDay(trip.data, stopId, dayId);
      if (res.data === trip.data) return;
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

    save: async (data) => {
      const { trip, status } = get();
      if (!trip || status === "saving") return;
      const payload = data ?? trip.data;
      set({ status: "saving" });
      try {
        const res = await fetch(`/api/trips/${trip.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: payload }),
        });
        if (!res.ok) throw new Error(`save failed: ${res.status}`);
        const { updatedAt } = await res.json();
        set((s) => ({
          status: "saved",
          trip: s.trip ? { ...s.trip, data: payload, updatedAt } : null,
        }));
      } catch {
        set({ status: "error" });
      }
    },
  }));

