import { api } from "@/lib/env";
import { tripDb } from "@/services/db";

/**
 * 推送服务（spec §8.3）：dirty 行程经 PUT /api/trips/[id] 幂等 upsert 到服务端。
 * M4 在此之上扩展 pull 增量、冲突 UI 与指数退避；当前实现覆盖 push 全路径。
 */

let pushing = false;
let queued = false;

export type PushResult = "ok" | "conflict" | "network";

/** 串行推送 dirty 行；网络失败保留 dirty 等待下次触发，冲突行保留待用户决策。 */
export async function pushDirty(limit = 10): Promise<{ pushed: number; conflicts: number }> {
  if (pushing) {
    queued = true;
    return { pushed: 0, conflicts: 0 };
  }
  pushing = true;
  let pushed = 0;
  let conflicts = 0;
  try {
    for (;;) {
      const batch = await tripDb.takeDirty(limit);
      if (batch.length === 0) break;
      let networkFailed = false;
      for (const item of batch) {
        const result = await pushOne(item);
        if (result === "ok") pushed += 1;
        else if (result === "conflict") conflicts += 1;
        else networkFailed = true;
      }
      // 网络失败即停止本轮（剩余 dirty 原样保留），避免无谓打满重试
      if (networkFailed) break;
      if (batch.length < limit) break;
    }
  } finally {
    pushing = false;
    if (queued) {
      queued = false;
      void pushDirty().catch(() => {});
    }
  }
  return { pushed, conflicts };
}

async function pushOne(item: {
  id: string;
  title: string | null;
  data: import("@roam/core").TripData;
  baseUpdatedAt: string;
  deleted: boolean;
}): Promise<PushResult> {
  try {
    const { trip } = await api().putTrip(item.id, {
      ...(item.deleted ? { deleted: true } : { data: item.data, title: item.title ?? "" }),
      expectedUpdatedAt: item.baseUpdatedAt,
    });
    await tripDb.markSynced(item.id, trip.updatedAt, trip.shareId || undefined);
    return "ok";
  } catch (err) {
    const status = err instanceof Error && "status" in err ? (err as { status?: number }).status : undefined;
    return status === 409 ? "conflict" : "network";
  }
}
