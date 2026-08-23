import { api } from "@/lib/env";
import { tripDb } from "@/services/db";
import { useSyncStore } from "@/store/useSyncStore";
import type { Trip, TripData } from "@roam/core";

/**
 * 同步引擎（spec §8.3）：
 * push：dirty 行程经 PUT 幂等 upsert；冲突行保留并登记 conflictIds 待用户决策；
 * pull：recentSince 增量拉取，非 dirty 行直接覆盖，tombstone 清除本地副本；
 * 退避：网络失败按 30s×2ⁿ 重试（封顶 10min），成功或手动触发时重置。
 */

const MAX_BACKOFF_MS = 10 * 60 * 1000;
const BASE_BACKOFF_MS = 30 * 1000;
const PUSH_BATCH = 10;

let pushing = false;
let queued = false;
let backoffTimer: ReturnType<typeof setTimeout> | null = null;
let backoffMs = BASE_BACKOFF_MS;

export interface SyncOutcome {
  pushed: number;
  conflicts: number;
  pulled: number;
}

/** 完整同步一轮：先推后拉。所有触发点（防抖保存/回前台/网络恢复/手动）汇聚到这里。 */
export async function syncNow(): Promise<SyncOutcome> {
  if (pushing) {
    queued = true;
    return { pushed: 0, conflicts: 0, pulled: 0 };
  }
  pushing = true;
  useSyncStore.getState().setState_({ state: "syncing" });

  let pushed = 0;
  let conflicts = 0;
  let pulled = 0;
  let networkFailed = false;

  try {
    // ---- push ----
    for (;;) {
      const batch = await tripDb.takeDirty(PUSH_BATCH);
      if (batch.length === 0) break;
      for (const item of batch) {
        const result = await pushOne(item);
        if (result === "ok") {
          pushed += 1;
          useSyncStore.getState().resolveConflictId(item.id);
        } else if (result === "conflict") {
          conflicts += 1;
          useSyncStore.getState().addConflict(item.id);
        } else {
          networkFailed = true;
        }
      }
      if (networkFailed) break; // 剩余 dirty 原样保留，等下次触发/退避
      if (batch.length < PUSH_BATCH) break;
    }

    // ---- pull（本轮有网络失败则跳过，避免半程状态误导）----
    if (!networkFailed) {
      pulled = await pull();
      useSyncStore.getState().setState_({ lastSyncAt: new Date().toISOString() });
    }

    useSyncStore.getState().setState_({ state: networkFailed ? "offline" : "idle" });
    if (networkFailed) scheduleBackoff();
    else resetBackoff();

    return { pushed, conflicts, pulled };
  } finally {
    pushing = false;
    if (queued) {
      queued = false;
      void syncNow().catch(() => {});
    }
  }
}

function scheduleBackoff() {
  if (backoffTimer) return;
  backoffTimer = setTimeout(() => {
    backoffTimer = null;
    void syncNow().catch(() => {});
  }, backoffMs);
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
}

function resetBackoff() {
  if (backoffTimer) {
    clearTimeout(backoffTimer);
    backoffTimer = null;
  }
  backoffMs = BASE_BACKOFF_MS;
}

type PushItem = Awaited<ReturnType<typeof tripDb.takeDirty>>[number];

async function pushOne(item: PushItem): Promise<"ok" | "conflict" | "network"> {
  try {
    const { trip } = await api().putTrip(item.id, {
      ...(item.deleted
        ? { deleted: true }
        : // deleted:false 显式声明：远端已被他端软删时，本地修改使其复活（行程级 LWW）
          { data: item.data, title: item.title ?? "", deleted: false }),
      // 从未同步过的行 base 为 epoch：服务端建档路径会忽略它；若远端已存在同 id 则按冲突处理
      expectedUpdatedAt: item.baseUpdatedAt,
    });
    await tripDb.markSynced(item.id, trip.updatedAt, trip.shareId || undefined);
    return "ok";
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 409) return "conflict";
    return "network";
  }
}

/** 增量拉取：非 dirty 行覆盖写入；tombstone 清除本地非 dirty 副本。 */
async function pull(): Promise<number> {
  const since = (await tripDb.getMeta("last_pull_at")) ?? new Date(0).toISOString();
  const delta = await api().recentSince(since);
  const dirtyIds = new Set((await tripDb.takeDirty(10_000)).map((r) => r.id));
  let applied = 0;

  for (const trip of delta.trips) {
    if (dirtyIds.has(trip.id)) continue; // 本地有未推送改动：推送阶段已登记冲突
    await tripDb.applyRemote(trip);
    applied += 1;
  }
  for (const id of delta.deletedIds) {
    if (dirtyIds.has(id)) continue;
    await tripDb.purgeRow(id);
    applied += 1;
  }
  await tripDb.setMeta("last_pull_at", new Date().toISOString());
  return applied;
}

/** 冲突决策「以本地为准」：force 覆盖服务端（spec §8.3）。 */
export async function resolveKeepLocal(id: string): Promise<void> {
  const items = await tripDb.takeDirty(1000);
  const item = items.find((r) => r.id === id);
  if (!item) {
    useSyncStore.getState().resolveConflictId(id);
    return;
  }
  const { trip } = await api().putTrip(id, {
    ...(item.deleted ? { deleted: true } : { data: item.data, title: item.title ?? "", deleted: false }),
    force: true,
  });
  await tripDb.markSynced(id, trip.updatedAt, trip.shareId || undefined);
  useSyncStore.getState().resolveConflictId(id);
}

/** 冲突决策「以云端为准」：放弃本地未推送修改，用远端版本覆盖本地并返回供 UI 重载。 */
export async function resolveTakeRemote(id: string): Promise<Trip | null> {
  try {
    const fresh = await api().getTrip(id);
    await tripDb.applyRemote(fresh);
    useSyncStore.getState().resolveConflictId(id);
    return fresh;
  } catch {
    return null;
  }
}
