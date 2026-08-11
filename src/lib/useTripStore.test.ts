import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTripStore } from "@/lib/useTripStore";
import type { Trip } from "@/lib/types";

function makeTrip(data?: Trip["data"]): Trip {
  return {
    id: "t1",
    shareId: "share1",
    ownerId: "o1",
    title: "路线",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    data: data ?? { days: [{ id: "d1", name: "第 1 天" }], stops: [], segments: [] },
  };
}

function twoDayTrip(): Trip {
  return makeTrip({
    days: [
      { id: "d1", name: "第 1 天" },
      { id: "d2", name: "第 2 天" },
    ],
    stops: [],
    segments: [],
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  useTripStore.setState({ trip: null, activeDayId: null });
});

describe("addStopAt 的天归属", () => {
  it("未选中天时回落 days[0]", () => {
    useTripStore.getState().load(twoDayTrip());
    const id = useTripStore.getState().addStopAt({ name: "A", lat: 1, lng: 1 });
    const stop = useTripStore.getState().trip!.data.stops.find((s) => s.id === id)!;
    expect(stop.dayId).toBe("d1");
  });

  it("跟随当前选中的天", () => {
    useTripStore.getState().load(twoDayTrip());
    useTripStore.getState().setActiveDayId("d2");
    const id = useTripStore.getState().addStopAt({ name: "A", lat: 1, lng: 1 });
    const stop = useTripStore.getState().trip!.data.stops.find((s) => s.id === id)!;
    expect(stop.dayId).toBe("d2");
  });

  it("显式 dayId 优先于 active", () => {
    useTripStore.getState().load(twoDayTrip());
    useTripStore.getState().setActiveDayId("d2");
    const id = useTripStore.getState().addStopAt({ dayId: "d1", name: "A", lat: 1, lng: 1 });
    const stop = useTripStore.getState().trip!.data.stops.find((s) => s.id === id)!;
    expect(stop.dayId).toBe("d1");
  });
});

describe("completeFreehand 的天归属", () => {
  it("无吸附端点时落入 activeDayId", () => {
    useTripStore.getState().load(twoDayTrip());
    useTripStore.getState().setActiveDayId("d2");
    useTripStore.getState().completeFreehand([[0, 0], [1, 1]]);
    const stops = useTripStore.getState().trip!.data.stops;
    expect(stops.map((s) => s.dayId)).toEqual(["d2", "d2"]);
  });
});

describe("addDay / removeDay 的 active 协调", () => {
  it("addDay 后自动切到新天", () => {
    useTripStore.getState().load(twoDayTrip());
    useTripStore.getState().addDay();
    const s = useTripStore.getState();
    expect(s.activeDayId).toBe(s.trip!.data.days.at(-1)!.id);
    expect(s.trip!.data.days).toHaveLength(3);
  });

  it("删除非选中天不影响 active", () => {
    useTripStore.getState().load(twoDayTrip());
    useTripStore.getState().setActiveDayId("d1");
    useTripStore.getState().removeDay("d2");
    expect(useTripStore.getState().activeDayId).toBe("d1");
  });

  it("删除选中天迁移到相邻天", () => {
    useTripStore.getState().load(twoDayTrip());
    useTripStore.getState().setActiveDayId("d2");
    useTripStore.getState().removeDay("d2");
    expect(useTripStore.getState().activeDayId).toBe("d1");
  });

  it("删除唯一一天为 no-op，active 保留", () => {
    const s = useTripStore.getState();
    s.load(makeTrip());
    s.setActiveDayId("d1");
    s.removeDay("d1");
    expect(useTripStore.getState().trip!.data.days).toHaveLength(1);
    expect(useTripStore.getState().activeDayId).toBe("d1");
  });
});

describe("保存状态机（跨行程守卫 / 409 冲突）", () => {
  it("跨行程切换：旧行程保存完成不污染新行程状态", async () => {
    let resolvePatch!: (value: unknown) => void;
    const patchPromise = new Promise((resolve) => {
      resolvePatch = resolve;
    });
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return patchPromise;
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const tripA = makeTrip();
    const tripB = { ...makeTrip(), id: "t2" };
    useTripStore.getState().load(tripA);
    // 触发保存（PATCH 挂起）
    const savePromise = useTripStore.getState().save();
    expect(useTripStore.getState().status).toBe("saving");

    // 保存期间切换到行程 B
    useTripStore.getState().load(tripB);
    expect(useTripStore.getState().status).toBe("idle");

    // 旧行程的保存完成
    resolvePatch({ ok: true, json: async () => ({ updatedAt: "2026-02-01T00:00:00Z" }) });
    await savePromise;

    const s = useTripStore.getState();
    expect(s.trip?.id).toBe("t2");
    // 新行程保持 load 设置的状态，不被旧保存置为 dirty
    expect(s.status).toBe("idle");
  });

  it("跨行程切换：旧行程保存失败不把新行程置为 error", async () => {
    let rejectPatch!: (reason?: unknown) => void;
    const patchPromise = new Promise((_, reject) => {
      rejectPatch = reject;
    });
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return patchPromise;
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const tripA = makeTrip();
    const tripB = { ...makeTrip(), id: "t2" };
    useTripStore.getState().load(tripA);
    const savePromise = useTripStore.getState().save();
    useTripStore.getState().load(tripB);

    rejectPatch(new Error("network"));
    await savePromise;

    const s = useTripStore.getState();
    expect(s.trip?.id).toBe("t2");
    expect(s.status).toBe("idle");
  });

  it("PATCH 409 时进入 conflict 状态并记录 serverUpdatedAt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "conflict", serverUpdatedAt: "2026-03-01T00:00:00Z" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    useTripStore.getState().load(makeTrip());
    await useTripStore.getState().save();

    const s = useTripStore.getState();
    expect(s.status).toBe("conflict");
    expect(s.conflict).toEqual({ serverUpdatedAt: "2026-03-01T00:00:00Z" });
    // 请求体携带 expectedUpdatedAt
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.expectedUpdatedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("resolveConflict('local') 以 force: true 重新保存", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: "conflict", serverUpdatedAt: "2026-03-01T00:00:00Z" }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ updatedAt: "2026-03-02T00:00:00Z" }) });
    vi.stubGlobal("fetch", fetchMock);
    useTripStore.getState().load(makeTrip());
    await useTripStore.getState().save();
    expect(useTripStore.getState().status).toBe("conflict");

    await useTripStore.getState().resolveConflict("local");

    const s = useTripStore.getState();
    expect(s.status).toBe("saved");
    expect(s.conflict).toBeNull();
    const [, init] = fetchMock.mock.calls[1];
    const body = JSON.parse(init.body as string);
    expect(body.force).toBe(true);
  });

  it("resolveConflict('server') 拉取服务器版本并 load", async () => {
    const fresh = { ...makeTrip(), title: "服务器版本", updatedAt: "2026-03-01T00:00:00Z" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: "conflict", serverUpdatedAt: "2026-03-01T00:00:00Z" }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => fresh });
    vi.stubGlobal("fetch", fetchMock);
    useTripStore.getState().load(makeTrip());
    await useTripStore.getState().save();
    expect(useTripStore.getState().status).toBe("conflict");

    await useTripStore.getState().resolveConflict("server");

    const s = useTripStore.getState();
    expect(s.status).toBe("idle");
    expect(s.conflict).toBeNull();
    expect(s.trip?.title).toBe("服务器版本");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/trips/t1");
  });
});
