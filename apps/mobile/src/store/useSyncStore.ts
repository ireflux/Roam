import { create } from "zustand";

export type SyncState = "idle" | "syncing" | "offline" | "error";

interface SyncInfo {
  state: SyncState;
  /** 推送冲突、等待用户决策的行程 id。 */
  conflictIds: string[];
  lastSyncAt: string | null;
}

interface SyncStore extends SyncInfo {
  setState_: (patch: Partial<SyncInfo>) => void;
  addConflict: (id: string) => void;
  resolveConflictId: (id: string) => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  state: "idle",
  conflictIds: [],
  lastSyncAt: null,
  setState_: (patch) => set(patch),
  addConflict: (id) => set((s) => (s.conflictIds.includes(id) ? s : { conflictIds: [...s.conflictIds, id] })),
  resolveConflictId: (id) => set((s) => ({ conflictIds: s.conflictIds.filter((x) => x !== id) })),
}));
