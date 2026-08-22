import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * store 单测（Node 环境）：db / sync / env 三个服务以 mock 注入，
 * 验证与 Web 版一致的编辑语义（ops 复用正确性、undo/redo、路由降级）。
 */

const { upsertLocal, markSynced, pushDirty, planRoute } = vi.hoisted(() => ({
  upsertLocal: vi.fn(),
  markSynced: vi.fn(),
  pushDirty: vi.fn(),
  planRoute: vi.fn(),
}));

vi.mock("@/services/db", () => ({
  tripDb: {
    upsertLocal,
    get: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    softDelete: vi.fn(),
    takeDirty: vi.fn().mockResolvedValue([]),
    markSynced,
    getMeta: vi.fn().mockResolvedValue(null),
    setMeta: vi.fn(),
  },
}));

vi.mock("@/services/sync", () => ({ pushDirty }));

vi.mock("@/lib/env", () => ({
  API_BASE_URL: "",
  api: () => ({ planRoute }),
}));

import { useTripStore } from "@/store/useTripStore";

function makeTripData() {
  return {
    days: [{ id: "d1", name: "第 1 天" }],
    stops: [],
    segments: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pushDirty.mockResolvedValue({ pushed: 0, conflicts: 0 });
  // 重置模块级单例状态
  useTripStore.setState({
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
  });
});

describe("useTripStore（mobile）", () => {
  it("createLocal 生成本地行程并立即落库", async () => {
    const id = await useTripStore.getState().createLocal("测试行程");
    const state = useTripStore.getState();
    expect(state.trip?.id).toBe(id);
    expect(state.trip?.title).toBe("测试行程");
    expect(upsertLocal).toHaveBeenCalledWith(expect.objectContaining({ id, dirty: true }));
  });

  it("addStopAt 在空天列表上自动建天，第二点触发路线规划", async () => {
    planRoute.mockResolvedValue({
      geometry: [
        [116.0, 39.0],
        [116.01, 39.01],
      ],
      distanceM: 1360,
      durationMin: 18,
    });
    await useTripStore.getState().createLocal();
    useTripStore.getState().addStopAt({ name: "A", lat: 39.0, lng: 116.0 });
    const bId = useTripStore.getState().addStopAt({ name: "B", lat: 39.01, lng: 116.01 });
    const trip = useTripStore.getState().trip!;
    expect(trip.data.stops).toHaveLength(2);
    expect(trip.data.segments).toHaveLength(1);
    expect(useTripStore.getState().segState[trip.data.segments[0].id]).toBe("pending");

    await vi.waitFor(() => {
      expect(useTripStore.getState().segState[trip.data.segments[0].id]).toBe("ok");
    });
    // 距离约 1.4km → 智能建议步行
    expect(planRoute).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "walking", from: [116.0, 39.0], to: [116.01, 39.01] }),
    );
    // 段几何已应用
    const seg = useTripStore.getState().trip!.data.segments[0];
    expect(seg.geometry.coordinates).toHaveLength(2);
    expect(seg.fromStop !== seg.toStop).toBe(true);
    void bId;
  });

  it("undo / redo 往返", async () => {
    await useTripStore.getState().createLocal();
    const s = useTripStore.getState();
    s.addStopAt({ name: "A", lat: 39, lng: 116 });
    expect(useTripStore.getState().canUndo).toBe(true);
    useTripStore.getState().undo();
    expect(useTripStore.getState().trip!.data.stops).toHaveLength(0);
    expect(useTripStore.getState().canRedo).toBe(true);
    useTripStore.getState().redo();
    expect(useTripStore.getState().trip!.data.stops).toHaveLength(1);
  });

  it("removeStop 级联删除相邻段", async () => {
    await useTripStore.getState().createLocal();
    const s = useTripStore.getState();
    const a = s.addStopAt({ name: "A", lat: 39, lng: 116 })!;
    const b = s.addStopAt({ name: "B", lat: 39.1, lng: 116.1 })!;
    const segCount = useTripStore.getState().trip!.data.segments.length;
    expect(segCount).toBe(1);
    useTripStore.getState().removeStop(b);
    const data = useTripStore.getState().trip!.data;
    expect(data.stops.map((x) => x.id)).toEqual([a]);
    expect(data.segments).toHaveLength(0);
  });

  it("flushNow 调用推送", async () => {
    await useTripStore.getState().createLocal();
    await useTripStore.getState().flushNow();
    expect(pushDirty).toHaveBeenCalled();
  });

  it("makeTripData 结构通过 isTripData 校验（core 共享类型契约）", async () => {
    const { isTripData } = await import("@roam/core");
    expect(isTripData(makeTripData())).toBe(true);
  });
});
