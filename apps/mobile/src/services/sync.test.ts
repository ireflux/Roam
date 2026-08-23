import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 同步引擎状态机测试（spec §10）：冲突、断网、pull 覆盖规则、冲突决策。
 * db / api 以 mock 注入；退避计时用 fake timers 验证。
 */

const { tripDb, apiPutTrip, apiRecentSince, apiGetTrip, setSyncState, addConflict, resolveConflictId } =
  vi.hoisted(() => ({
    tripDb: {
      takeDirty: vi.fn(),
      markSynced: vi.fn(),
      applyRemote: vi.fn(),
      purgeRow: vi.fn(),
      getMeta: vi.fn(),
      setMeta: vi.fn(),
    },
    apiPutTrip: vi.fn(),
    apiRecentSince: vi.fn(),
    apiGetTrip: vi.fn(),
    setSyncState: vi.fn(),
    addConflict: vi.fn(),
    resolveConflictId: vi.fn(),
  }));

vi.mock("@/services/db", () => ({ tripDb }));
vi.mock("@/lib/env", () => ({
  API_BASE_URL: "",
  api: () => ({ putTrip: apiPutTrip, recentSince: apiRecentSince, getTrip: apiGetTrip }),
}));
vi.mock("@/store/useSyncStore", () => ({
  useSyncStore: {
    getState: () => ({
      setState_: setSyncState,
      addConflict,
      resolveConflictId,
    }),
  },
}));

import { resolveKeepLocal, resolveTakeRemote, syncNow } from "@/services/sync";

function makeItem(overrides: Partial<{ id: string; baseUpdatedAt: string; deleted: boolean }> = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    title: "t" as string | null,
    data: { days: [], stops: [], segments: [] },
    baseUpdatedAt: overrides.baseUpdatedAt ?? new Date().toISOString(),
    deleted: overrides.deleted ?? false,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  tripDb.getMeta.mockResolvedValue(null);
  tripDb.takeDirty.mockResolvedValue([]);
  tripDb.markSynced.mockResolvedValue(undefined);
  tripDb.applyRemote.mockResolvedValue(undefined);
  tripDb.purgeRow.mockResolvedValue(undefined);
  tripDb.setMeta.mockResolvedValue(undefined);
  apiRecentSince.mockResolvedValue({ trips: [], deletedIds: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("syncNow", () => {
  it("推送成功：PUT 携带全量快照 + 基准版本，成功后 markSynced 并回填 shareId", async () => {
    const item = makeItem({ baseUpdatedAt: "2026-01-01T00:00:00.000Z" });
    tripDb.takeDirty.mockResolvedValueOnce([item]).mockResolvedValue([]);
    apiPutTrip.mockResolvedValue({ trip: { updatedAt: "2026-01-02T00:00:00.000Z", shareId: "share1" } });

    const out = await syncNow();

    expect(out.pushed).toBe(1);
    expect(apiPutTrip).toHaveBeenCalledWith(item.id, {
      data: item.data,
      title: item.title,
      deleted: false,
      expectedUpdatedAt: item.baseUpdatedAt,
    });
    expect(tripDb.markSynced).toHaveBeenCalledWith(item.id, "2026-01-02T00:00:00.000Z", "share1");
  });

  it("409 冲突：登记 conflictIds，行保留 dirty，不调度网络退避", async () => {
    const item = makeItem();
    tripDb.takeDirty.mockResolvedValueOnce([item]).mockResolvedValue([]);
    const err = Object.assign(new Error("conflict"), { status: 409 });
    apiPutTrip.mockRejectedValue(err);

    const out = await syncNow();

    expect(out.conflicts).toBe(1);
    expect(addConflict).toHaveBeenCalledWith(item.id);
    expect(tripDb.markSynced).not.toHaveBeenCalled();
    // 无网络失败 → 不安排退避定时器
    await vi.advanceTimersByTimeAsync(60_000);
    expect(setSyncState).toHaveBeenCalledWith(expect.objectContaining({ state: "idle" }));
  });

  it("网络失败：置 offline、保留 dirty、按 30s 退避自动重试", async () => {
    const item = makeItem();
    tripDb.takeDirty.mockReturnValue([item]); // 每次取都返回（重试后仍 dirty）
    apiPutTrip.mockRejectedValue(new TypeError("network down"));

    await syncNow();

    expect(setSyncState).toHaveBeenCalledWith(expect.objectContaining({ state: "offline" }));

    // 第一轮退避 30s 后自动重试并成功
    apiPutTrip.mockResolvedValue({ trip: { updatedAt: "2026-01-03T00:00:00.000Z" } });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(apiPutTrip).toHaveBeenCalledTimes(2);
    expect(tripDb.markSynced).toHaveBeenCalled();
  });

  it("pull：非 dirty 远端变更覆盖本地，dirty 行跳过；tombstone 清除本地副本", async () => {
    const remoteA = {
      id: "a",
      shareId: "s-a",
      title: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-05T00:00:00.000Z",
      data: { days: [{ id: "d1" }], stops: [], segments: [] },
    };
    const localDirty = makeItem({ id: "b" });
    tripDb.takeDirty.mockImplementation(async () => [localDirty]);
    tripDb.getMeta.mockResolvedValue("2026-01-04T00:00:00.000Z");
    apiRecentSince.mockResolvedValue({
      trips: [remoteA],
      deletedIds: ["c", "b"], // b 本地 dirty → 跳过
    });

    const out = await syncNow();

    expect(out.pulled).toBe(2); // a 覆盖 + c 清除；b 跳过
    expect(tripDb.applyRemote).toHaveBeenCalledWith(remoteA);
    expect(tripDb.purgeRow).toHaveBeenCalledTimes(1);
    expect(tripDb.purgeRow).toHaveBeenCalledWith("c");
    expect(tripDb.setMeta).toHaveBeenCalledWith("last_pull_at", expect.any(String));
  });

  it("先推后拉：本轮网络失败时跳过 pull", async () => {
    tripDb.takeDirty.mockResolvedValue([makeItem()]);
    apiPutTrip.mockRejectedValue(new TypeError("down"));
    await syncNow();
    expect(apiRecentSince).not.toHaveBeenCalled();
  });
});

describe("冲突决策", () => {
  it("resolveKeepLocal：force PUT 不携带基准版本", async () => {
    const item = makeItem({ id: "x" });
    tripDb.takeDirty.mockResolvedValue([item]);
    apiPutTrip.mockResolvedValue({ trip: { updatedAt: "u1", shareId: "sx" } });

    await resolveKeepLocal("x");

    expect(apiPutTrip).toHaveBeenCalledWith(
      "x",
      expect.objectContaining({ force: true, deleted: false }),
    );
    const body = apiPutTrip.mock.calls[0][1];
    expect(body.expectedUpdatedAt).toBeUndefined();
    expect(resolveConflictId).toHaveBeenCalledWith("x");
  });

  it("resolveTakeRemote：拉取远端覆盖本地并返回行程", async () => {
    const fresh = {
      id: "y",
      shareId: "sy",
      title: "cloud",
      createdAt: "",
      updatedAt: "u2",
      data: { days: [], stops: [], segments: [] },
    };
    apiGetTrip.mockResolvedValue(fresh);

    const result = await resolveTakeRemote("y");

    expect(result?.title).toBe("cloud");
    expect(tripDb.applyRemote).toHaveBeenCalledWith(fresh);
    expect(resolveConflictId).toHaveBeenCalledWith("y");
  });

  it("resolveTakeRemote 网络失败返回 null 且不清冲突标记", async () => {
    apiGetTrip.mockRejectedValue(new TypeError("down"));
    const result = await resolveTakeRemote("z");
    expect(result).toBeNull();
    expect(resolveConflictId).not.toHaveBeenCalledWith("z");
  });
});
