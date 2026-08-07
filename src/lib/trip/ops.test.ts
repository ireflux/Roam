import { describe, expect, it } from "vitest";
import {
  addDay,
  addStop,
  applyFallbackLine,
  applyRoute,
  autoSegment,
  completeFreehand,
  markSegmentSnapped,
  moveStopToDay,
  removeDay,
  removeStop,
  renameDay,
  reorderDays,
  reorderStops,
  segmentRequest,
  setSegmentMode,
  simplifyVertices,
  updateSegmentVertex,
} from "@/lib/trip/ops";
import type { TripData, TripSegment, TripStop } from "@/lib/types";

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

  it("删除中间站点继承前段出行方式，而非恒为 driving", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const c = stop("c", 2);
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a, b, c],
      segments: [
        autoSegment(a, b, "walking"),
        autoSegment(b, c, "driving"),
      ],
    };
    const r = removeStop(data, "b");
    expect(r.data.segments[0].mode).toBe("walking");
    expect(r.needed[0].mode).toBe("walking");
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

  it("重排后相邻对方向未变的段保留原几何且不重算", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const c = stop("c", 2);
    const segAB = autoSegment(a, b, "driving");
    const segBC = autoSegment(b, c, "driving");
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a, b, c],
      segments: [segAB, segBC],
    };
    // b 移到最前：新链 b→a→c；a→c 是新对需重算，b→a 是反向需重算
    const r = reorderStops(data, DAY, 1, 0);
    const pairs = r.data.segments.map((s) => `${s.fromStop}->${s.toStop}`);
    expect(pairs).toContain("b->a");
    expect(pairs).toContain("a->c");
    expect(r.needed).toHaveLength(2);
  });

  it("重排保留方向未变的手绘段，不降级为 auto", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const c = stop("c", 2);
    const freehand: TripSegment = {
      ...autoSegment(b, c, "walking"),
      kind: "freehand",
      geometry: { type: "LineString", coordinates: [[1, 1], [1.5, 1.5], [2, 2]] },
    };
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a, b, c],
      segments: [autoSegment(a, b, "driving"), freehand],
    };
    // a 移到 c 之后：新链 b→c→a；b→c 方向未变 → 保留 freehand 段，不重算
    const r = reorderStops(data, DAY, 0, 2);
    expect(r.data.segments).toHaveLength(2);
    const kept = r.data.segments.find((s) => s.fromStop === "b" && s.toStop === "c")!;
    expect(kept.kind).toBe("freehand");
    expect(kept.geometry.coordinates).toHaveLength(3);
    expect(r.needed.some((n) => n.segId === `${b.id}->${c.id}`)).toBe(false);
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
      geometry: [[1, 1], [1.5, 1.5], [2, 1]],
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

  it("applyRoute 压缩超长几何到容量内且保留首尾", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a, b],
      segments: [autoSegment(a, b, "driving")],
    };
    const segId = `${a.id}->${b.id}`;
    // 一条大圆弧：点很多但基本共线，简化后应显著减少
    const many: [number, number][] = Array.from({ length: 8_000 }, (_, i) => [i * 0.001, 0] as [number, number]);
    const next = applyRoute(data, segId, { geometry: many, distanceM: 1000, durationMin: 10 });
    const coords = next.segments[0].geometry.coordinates;
    expect(coords.length).toBeLessThan(many.length);
    expect(coords[0][0]).toBe(0);
    expect(coords[coords.length - 1][0]).toBeCloseTo(7.999, 3);
  });

  it("applyRoute 坐标取整到 6 位小数", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a, b],
      segments: [autoSegment(a, b, "driving")],
    };
    const segId = `${a.id}->${b.id}`;
    const next = applyRoute(data, segId, { geometry: [[1.0000004, 2.0000006], [3.0000009, 4.0000001]], distanceM: 500, durationMin: 5 });
    const [lng, lat] = next.segments[0].geometry.coordinates[0];
    expect(Math.round(lng * 1e6)).toBe(1000000);
    expect(Math.round(lat * 1e6)).toBe(2000001);
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

  it("手绘长线会被压缩，保留首尾", () => {
    const data = emptyData();
    const dense: [number, number][] = Array.from({ length: 5_000 }, (_, i) => [i * 0.0001, 0.0001 * i] as [number, number]);
    const r = completeFreehand(data, dense, "walking");
    const coords = r.data.segments[0].geometry.coordinates;
    expect(coords.length).toBeLessThan(dense.length);
    expect(coords[0]).toEqual([0, 0]);
    expect(coords[coords.length - 1][0]).toBeCloseTo(0.4999, 3);
  });
});

describe("moveStopToDay", () => {
  it("跨日移动继承原段出行方式", () => {
    const d1 = { id: "d1", name: "第 1 天" };
    const d2 = { id: "d2", name: "第 2 天" };
    const z = { ...stop("z", 0), dayId: "d2", order: 0 };
    const a = stop("a", 0);
    const b = stop("b", 1);
    const c = stop("c", 2);
    const data: TripData = {
      days: [d1, d2],
      stops: [a, b, c, z],
      segments: [
        autoSegment(a, b, "cycling"),
        autoSegment(b, c, "walking"),
      ],
    };
    // b 移到 d2：源日 a→c 重连继承 a→b 的 cycling；d2 尾部 z→b 继承 b 到达方式 cycling
    const r = moveStopToDay(data, "b", "d2");
    const reconnect = r.data.segments.find((s) => s.fromStop === "a" && s.toStop === "c")!;
    const tail = r.data.segments.find((s) => s.fromStop === "z" && s.toStop === "b")!;
    expect(reconnect.mode).toBe("cycling");
    expect(tail.mode).toBe("cycling");
    expect(r.needed).toHaveLength(2);
  });

  it("无相邻段时回退 driving", () => {
    const d1 = { id: "d1", name: "第 1 天" };
    const d2 = { id: "d2", name: "第 2 天" };
    const a = stop("a", 0);
    const b = stop("b", 1);
    const data: TripData = {
      days: [d1, d2],
      stops: [a, b],
      segments: [],
    };
    const r = moveStopToDay(data, "a", "d2");
    expect(r.needed).toHaveLength(0);
    expect(r.data.stops.find((s) => s.id === "a")!.dayId).toBe("d2");
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

describe("changed 标志", () => {
  it("addStop 产生变更", () => {
    const r = addStop(emptyData(), { dayId: DAY, name: "A", lat: 1, lng: 1, mode: "driving" });
    expect(r.changed).toBe(true);
  });

  it("removeStop 不存在的站点是 no-op", () => {
    const data = emptyData();
    const r = removeStop(data, "nope");
    expect(r.changed).toBe(false);
    expect(r.data).toBe(data);
  });

  it("reorderStops 同位置是 no-op", () => {
    let data = emptyData();
    data = addStop(data, { dayId: DAY, name: "A", lat: 1, lng: 1, mode: "driving" }).data;
    data = addStop(data, { dayId: DAY, name: "B", lat: 2, lng: 2, mode: "driving" }).data;
    const r = reorderStops(data, DAY, 1, 1);
    expect(r.changed).toBe(false);
    expect(r.data).toBe(data);
  });

  it("moveStopToDay 移动到同一天是 no-op", () => {
    const a = stop("a", 0);
    const data: TripData = { days: [{ id: DAY, name: "d" }], stops: [a], segments: [] };
    const r = moveStopToDay(data, "a", DAY);
    expect(r.changed).toBe(false);
  });

  it("removeDay 仅剩一天时是 no-op", () => {
    const data = emptyData();
    const r = removeDay(data, DAY);
    expect(r.changed).toBe(false);
    expect(r.data).toBe(data);
  });

  it("addDay 产生变更", () => {
    const r = addDay(emptyData());
    expect(r.changed).toBe(true);
  });
});

describe("renameDay", () => {
  it("重命名天", () => {
    const data = emptyData();
    const r = renameDay(data, DAY, "  上海 Day 1  ");
    expect(r.changed).toBe(true);
    expect(r.data.days[0].name).toBe("上海 Day 1");
  });

  it("空名称重置为 undefined（fallback 自动命名）", () => {
    const data: TripData = { days: [{ id: DAY, name: "自定义" }], stops: [], segments: [] };
    const r = renameDay(data, DAY, "   ");
    expect(r.changed).toBe(true);
    expect(r.data.days[0].name).toBeUndefined();
  });

  it("同名或不存在是 no-op", () => {
    const data: TripData = { days: [{ id: DAY, name: "自定义" }], stops: [], segments: [] };
    expect(renameDay(data, DAY, "自定义").changed).toBe(false);
    expect(renameDay(data, "nope", "x").changed).toBe(false);
  });
});

describe("reorderDays", () => {
  it("重排天数数组顺序，不影响站点归属", () => {
    const d1 = { id: "d1", name: undefined };
    const d2 = { id: "d2", name: undefined };
    const d3 = { id: "d3", name: undefined };
    const s1 = { ...stop("a", 0), dayId: "d1" };
    const s2 = { ...stop("b", 0), dayId: "d2" };
    const data: TripData = { days: [d1, d2, d3], stops: [s1, s2], segments: [] };
    const r = reorderDays(data, 0, 2);
    expect(r.changed).toBe(true);
    expect(r.data.days.map((d) => d.id)).toEqual(["d2", "d3", "d1"]);
    expect(r.data.stops.find((s) => s.id === "a")!.dayId).toBe("d1");
  });

  it("同位置或越界是 no-op", () => {
    const data = emptyData();
    expect(reorderDays(data, 0, 0).changed).toBe(false);
    expect(reorderDays(data, 0, 5).changed).toBe(false);
    expect(reorderDays(data, -1, 1).changed).toBe(false);
  });
});