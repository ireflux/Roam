import { describe, expect, it } from "vitest";
import {
  addStop,
  applyFallbackLine,
  applyRoute,
  autoSegment,
  completeFreehand,
  markSegmentSnapped,
  removeStop,
  reorderStops,
  segmentRequest,
  setSegmentMode,
  simplifyVertices,
  updateSegmentVertex,
} from "@/lib/trip/ops";
import type { TripData, TripStop } from "@/lib/types";

const DAY = "d1";

function emptyData(): TripData {
  return { days: [{ id: DAY, name: "第 1 天" }], stops: [], segments: [] };
}

function stop(id: string, order: number, name = id): TripStop {
  return { id, dayId: DAY, name, lat: order, lng: order, order };
}

describe("addStop", () => {
  it("第一个站点不产生段", () => {
    const r = addStop(emptyData(), { dayId: DAY, name: "A", lat: 1, lng: 1, mode: "driving" });
    expect(r.data.stops).toHaveLength(1);
    expect(r.data.segments).toHaveLength(0);
    expect(r.needed).toHaveLength(0);
  });

  it("添加第二个站点产生 auto 段并请求路线", () => {
    let data = emptyData();
    data = addStop(data, { dayId: DAY, name: "A", lat: 1, lng: 1, mode: "driving" }).data;
    const r = addStop(data, { dayId: DAY, name: "B", lat: 2, lng: 2, mode: "driving" });
    expect(r.data.segments).toHaveLength(1);
    expect(r.needed).toHaveLength(1);
    expect(r.needed[0].segId).toBe(`${r.data.stops[0].id}->${r.data.stops[1].id}`);
    expect(r.needed[0].from).toEqual([1, 1]);
    expect(r.needed[0].to).toEqual([2, 2]);
    expect(r.data.segments[0].kind).toBe("auto");
  });

  it("保证 day 存在", () => {
    const r = addStop({ days: [], stops: [], segments: [] }, { dayId: "x", name: "A", lat: 0, lng: 0, mode: "walking" });
    expect(r.data.days).toHaveLength(1);
    expect(r.data.days[0].id).toBe("x");
  });
});

describe("removeStop", () => {
  it("删除中间站点，前后相邻自动重连并请求路线", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const c = stop("c", 2);
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a, b, c],
      segments: [
        autoSegment(a, b, "driving"),
        autoSegment(b, c, "walking"),
      ],
    };
    const r = removeStop(data, "b");
    expect(r.data.stops.map((s) => s.id)).toEqual(["a", "c"]);
    expect(r.data.stops.find((s) => s.id === "c")!.order).toBe(1);
    expect(r.data.segments).toHaveLength(1);
    expect(r.data.segments[0].fromStop).toBe("a");
    expect(r.data.segments[0].toStop).toBe("c");
    expect(r.data.segments[0].mode).toBe("driving");
    expect(r.needed).toHaveLength(1);
  });

  it("删除端点站点只移出段", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a, b],
      segments: [autoSegment(a, b, "driving")],
    };
    const r = removeStop(data, "a");
    expect(r.data.stops).toHaveLength(1);
    expect(r.data.segments).toHaveLength(0);
    expect(r.needed).toHaveLength(0);
  });
});

describe("reorderStops", () => {
  it("重排后重建链并标记受影响段重算", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const c = stop("c", 2);
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a, b, c],
      segments: [autoSegment(a, b, "driving"), autoSegment(b, c, "driving")],
    };
    const r = reorderStops(data, DAY, 0, 2);
    expect(r.data.stops.map((s) => s.name)).toContain("a");
    const orderMap = new Map(r.data.stops.map((s) => [s.name, s.order]));
    expect([...orderMap.entries()].sort()).toEqual([
      ["a", 2],
      ["b", 0],
      ["c", 1],
    ]);
    expect(r.data.segments).toHaveLength(2);
    expect(r.needed.length).toBeGreaterThan(0);
  });
});

describe("setSegmentMode", () => {
  it("切换模式后标记重算", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a, b],
      segments: [autoSegment(a, b, "driving")],
    };
    const r = setSegmentMode(data, `${a.id}->${b.id}`, "walking");
    expect(r.data.segments[0].mode).toBe("walking");
    expect(r.needed).toHaveLength(1);
    expect(r.needed[0].mode).toBe("walking");
  });

  it("freehand 段切换模式后转 auto 但不立即重算", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const seg = { ...autoSegment(a, b, "driving"), kind: "freehand" as const };
    const data: TripData = { days: [{ id: DAY, name: "d" }], stops: [a, b], segments: [seg] };
    const r = setSegmentMode(data, seg.id, "cycling");
    expect(r.data.segments[0].kind).toBe("auto");
    expect(r.data.segments[0].mode).toBe("cycling");
    expect(r.needed).toHaveLength(0);
  });
});

describe("applyRoute / applyFallbackLine", () => {
  it("写入路线几何与里程", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a, b],
      segments: [autoSegment(a, b, "driving")],
    };
    const segId = `${a.id}->${b.id}`;
    const next = applyRoute(data, segId, {
      geometry: [[1, 1], [1.5, 1.5], [2, 2]],
      distanceM: 500,
      durationMin: 10,
    });
    expect(next.segments[0].geometry.coordinates).toHaveLength(3);
    expect(next.segments[0].distanceM).toBe(500);
    expect(next.segments[0].durationMin).toBe(10);
  });

  it("降级为直线段", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a, b],
      segments: [autoSegment(a, b, "driving")],
    };
    const segId = `${a.id}->${b.id}`;
    const next = applyFallbackLine(data, segId, {
      geometry: [[1, 1], [2, 2]],
      distanceM: 100,
      durationMin: 1,
    });
    expect(next.segments[0].kind).toBe("freehand");
  });

  it("segmentRequest 提取端点", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const seg = autoSegment(a, b, "cycling");
    const req = segmentRequest(seg);
    expect(req.from).toEqual([0, 0]);
    expect(req.to).toEqual([1, 1]);
    expect(req.mode).toBe("cycling");
  });
});

describe("completeFreehand", () => {
  it("两端都吸附已有站点时不新增站点", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a, b],
      segments: [],
    };
    const nearA: [number, number] = [a.lng + 0.0005, a.lat];
    const nearB: [number, number] = [b.lng - 0.0005, b.lat];
    const r = completeFreehand(data, [nearA, [0.8, 0.8], nearB], "walking");
    expect(r.data.stops).toHaveLength(2);
    expect(r.data.segments).toHaveLength(1);
    expect(r.data.segments[0].fromStop).toBe("a");
    expect(r.data.segments[0].toStop).toBe("b");
    expect(r.data.segments[0].kind).toBe("freehand");
    expect(r.needed).toHaveLength(0);
  });

  it("远端新建站点", () => {
    const a = stop("a", 0);
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a],
      segments: [],
    };
    const far: [number, number] = [10, 10];
    const r = completeFreehand(data, [[a.lng + 0.0005, a.lat], [0.5, 0.5], far], "walking");
    expect(r.data.stops).toHaveLength(2);
    expect(r.data.segments).toHaveLength(1);
    expect(r.data.stops.find((s) => s.id === "a")).toBeTruthy();
    const newStop = r.data.stops.find((s) => s.id !== "a")!;
    expect(newStop.name).toBe("绘制终点");
    expect(newStop.dayId).toBe(DAY);
    expect(r.data.segments[0].geometry.coordinates).toHaveLength(3);
  });

  it("点数不足 2 时不产生数据", () => {
    const data = emptyData();
    const r = completeFreehand(data, [[1, 1]], "driving");
    expect(r.data).toBe(data);
  });
});

describe("updateSegmentVertex / markSegmentSnapped", () => {
  it("更新指定顶点坐标并标记 snapped", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const seg = { ...autoSegment(a, b, "driving"), geometry: { type: "LineString" as const, coordinates: [[0, 0], [0.5, 0.5], [1, 1]] as [number, number][] } };
    const data: TripData = { days: [{ id: DAY, name: "d" }], stops: [a, b], segments: [seg] };
    const moved = updateSegmentVertex(data, seg.id, 1, [0.6, 0.4]);
    expect(moved.segments[0].geometry.coordinates[1]).toEqual([0.6, 0.4]);
    const snapped = markSegmentSnapped(moved, seg.id);
    expect(snapped.segments[0].kind).toBe("snapped");
  });
});

describe("simplifyVertices", () => {
  it("超长线降采样保留首尾", () => {
    const coords = Array.from({ length: 100 }, (_, i) => [i, i] as [number, number]);
    const out = simplifyVertices(coords, 10);
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual([0, 0]);
    expect(out[9]).toEqual([99, 99]);
  });

  it("短线原样返回", () => {
    const coords: [number, number][] = [[0, 0], [1, 1]];
    expect(simplifyVertices(coords, 10)).toHaveLength(2);
  });
});