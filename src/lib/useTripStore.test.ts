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
    const id = useTripStore.getState().addStopAt({ name: "A", lat: 1, lng: 1, mode: "driving" });
    const stop = useTripStore.getState().trip!.data.stops.find((s) => s.id === id)!;
    expect(stop.dayId).toBe("d1");
  });

  it("跟随当前选中的天", () => {
    useTripStore.getState().load(twoDayTrip());
    useTripStore.getState().setActiveDayId("d2");
    const id = useTripStore.getState().addStopAt({ name: "A", lat: 1, lng: 1, mode: "driving" });
    const stop = useTripStore.getState().trip!.data.stops.find((s) => s.id === id)!;
    expect(stop.dayId).toBe("d2");
  });

  it("显式 dayId 优先于 active", () => {
    useTripStore.getState().load(twoDayTrip());
    useTripStore.getState().setActiveDayId("d2");
    const id = useTripStore.getState().addStopAt({ dayId: "d1", name: "A", lat: 1, lng: 1, mode: "driving" });
    const stop = useTripStore.getState().trip!.data.stops.find((s) => s.id === id)!;
    expect(stop.dayId).toBe("d1");
  });
});

describe("completeFreehand 的天归属", () => {
  it("无吸附端点时落入 activeDayId", () => {
    useTripStore.getState().load(twoDayTrip());
    useTripStore.getState().setActiveDayId("d2");
    useTripStore.getState().completeFreehand([[0, 0], [1, 1]], "walking");
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