import { describe, expect, it } from "vitest";
import {
  addDay,
  addStop,
  applyFallbackLine,
  applyRoute,
  autoSegment,
  completeFreehand,
  daySegments,
  dayStops,
  markSegmentSnapped,
  moveStopToDay,
  nextActiveAfterDayRemoved,
  removeDay,
  removeStop,
  renameDay,
  reorderDays,
  reorderStops,
  repairSegmentIds,
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
    expect(r.needed[0].segId).toBe(r.data.segments[0].id);
    expect(r.needed[0].from).toEqual([1, 1]);
    expect(r.needed[0].to).toEqual([2, 2]);
    expect(r.data.segments[0].kind).toBe("auto");
  });

  it("addedId 直接返回新增站点 id（不依赖坐标反查）", () => {
    const r = addStop(emptyData(), { dayId: DAY, name: "A", lat: 1, lng: 1, mode: "driving" });
    expect(r.addedId).toBe(r.data.stops[0].id);
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
    expect(r.needed.some((n) => n.segId === kept.id)).toBe(false);
  });
});

describe("段 id 唯一性", () => {
  it("同一有序点对出现在不同天时自动段 id 不碰撞", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const pairs: TripSegment[] = [autoSegment(a, b, "driving"), autoSegment(a, b, "cycling")];
    expect(pairs[0].id).not.toBe(pairs[1].id);
    expect(new Set(pairs.map((s) => s.id)).size).toBe(2);
  });

  it("repairSegmentIds 去重历史重复 id 并保留原引用当无重复", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const dup1 = autoSegment(a, b, "driving");
    const dup2 = { ...autoSegment(a, b, "walking"), id: dup1.id };
    const data: TripData = { days: [{ id: DAY, name: "d" }], stops: [a, b], segments: [dup1, dup2] };
    const repaired = repairSegmentIds(data);
    expect(repaired.segments[0].id).not.toBe(repaired.segments[1].id);
    expect(new Set(repaired.segments.map((s) => s.id)).size).toBe(2);
    const clean: TripData = { ...data, segments: [dup1] };
    expect(repairSegmentIds(clean)).toBe(clean);
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
    const r = setSegmentMode(data, data.segments[0].id, "walking");
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
    const segId = data.segments[0].id;
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
    const segId = data.segments[0].id;
    const next = applyFallbackLine(data, segId, {
      geometry: [[1, 1], [2, 2]],
      distanceM: 100,
      durationMin: 1,
    });
    expect(next.segments[0].degraded).toBe(true);
    expect(next.segments[0].kind).toBe("auto");
  });

  it("applyRoute 成功后清除降级标记", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a, b],
      segments: [autoSegment(a, b, "driving")],
    };
    const segId = data.segments[0].id;
    const degraded = applyFallbackLine(data, segId, { geometry: [[1, 1], [2, 2]], distanceM: 100, durationMin: 1 });
    expect(degraded.segments[0].degraded).toBe(true);
    const routed = applyRoute(degraded, segId, {
      geometry: [[1, 1], [1.5, 1.5], [2, 1]],
      distanceM: 500,
      durationMin: 10,
    });
    expect(routed.segments[0].degraded).toBe(false);
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
    const segId = data.segments[0].id;
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
    const segId = data.segments[0].id;
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

  it("首尾吸附同一站点且路径足够长时允许环形段（from===to）", () => {
    const a = stop("a", 0);
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a],
      segments: [],
    };
    // 以 a 为圆心绕一圈（约 1km 路径），首尾都落在 a 附近
    const loop: [number, number][] = [
      [a.lng, a.lat],
      [a.lng + 0.002, a.lat + 0.001],
      [a.lng + 0.004, a.lat],
      [a.lng + 0.002, a.lat - 0.001],
      [a.lng, a.lat],
    ];
    const r = completeFreehand(data, loop, "walking");
    expect(r.changed).toBe(true);
    expect(r.data.segments).toHaveLength(1);
    expect(r.data.segments[0].fromStop).toBe("a");
    expect(r.data.segments[0].toStop).toBe("a");
    expect(r.data.segments[0].kind).toBe("freehand");
  });

  it("首尾吸附同一站点但路径过短时视为误触，忽略本次绘制", () => {
    const a = stop("a", 0);
    const data: TripData = {
      days: [{ id: DAY, name: "d" }],
      stops: [a],
      segments: [],
    };
    // 仅在 a 附近小幅度抖动（路径 <200m）
    const jitter: [number, number][] = [
      [a.lng, a.lat],
      [a.lng + 0.0003, a.lat + 0.0002],
      [a.lng, a.lat],
    ];
    const r = completeFreehand(data, jitter, "walking");
    expect(r.changed).toBe(false);
    expect(r.data).toBe(data);
    expect(r.data.segments).toHaveLength(0);
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

  it("改线后清除公交/地铁 parts，避免渲染仍按旧子段", () => {
    const a = stop("a", 0);
    const b = stop("b", 1);
    const seg: TripSegment = {
      ...autoSegment(a, b, "transit"),
      geometry: { type: "LineString" as const, coordinates: [[0, 0], [0.5, 0.5], [1, 1]] as [number, number][] },
      parts: [{ kind: "walking", coordinates: [[0, 0], [0.5, 0.5]] as [number, number][] }, { kind: "transit", coordinates: [[0.5, 0.5], [1, 1]] as [number, number][] }],
    };
    const data: TripData = { days: [{ id: DAY, name: "d" }], stops: [a, b], segments: [seg] };
    const moved = updateSegmentVertex(data, seg.id, 1, [0.6, 0.4]);
    expect(moved.segments[0].parts).toBeUndefined();
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

  it("空名称回填自动名（不再依赖数组下标）", () => {
    const data: TripData = { days: [{ id: DAY, name: "自定义" }], stops: [], segments: [] };
    const r = renameDay(data, DAY, "   ");
    expect(r.changed).toBe(true);
    expect(r.data.days[0].name).toBe("第 1 天");
  });

  it("重排天不会改变名称", () => {
    const data: TripData = {
      days: [
        { id: "d1", name: "第 1 天" },
        { id: "d2", name: "第 2 天" },
      ],
      stops: [],
      segments: [],
    };
    const r = reorderDays(data, 1, 0);
    expect(r.data.days.map((d) => d.name)).toEqual(["第 2 天", "第 1 天"]);
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

describe("dayStops / daySegments（按天可见性）", () => {
  const d1 = { id: "d1", name: "第 1 天" };
  const d2 = { id: "d2", name: "第 2 天" };
  const a = stop("a", 0, "A");
  const b = stop("b", 1, "B");
  const x = { ...stop("x", 0, "X"), dayId: "d2" };
  const y = { ...stop("y", 1, "Y"), dayId: "d2" };
  const withinD1 = autoSegment(a, b, "driving");
  const withinD2 = autoSegment(x, y, "walking");
  // 跨天段：起点 b 在 d1、终点 x 在 d2 → 归属 d1
  const cross = autoSegment(b, x, "transit");
  const data: TripData = {
    days: [d1, d2],
    stops: [a, b, x, y],
    segments: [withinD1, withinD2, cross],
  };

  it("dayStops 只返回指定天的站点", () => {
    expect(dayStops(data, "d1").map((s) => s.id)).toEqual(["a", "b"]);
    expect(dayStops(data, "d2").map((s) => s.id)).toEqual(["x", "y"]);
  });

  it("daySegments 归并跨天段到起点站所在天", () => {
    expect(daySegments(data, "d1").map((s) => s.id)).toEqual([withinD1.id, cross.id]);
    expect(daySegments(data, "d2").map((s) => s.id)).toEqual([withinD2.id]);
  });

  it("站点移到别天后段随起点迁移", () => {
    const moved = moveStopToDay(data, "b", "d2");
    // b 移走后：d1 只剩 a（无段）；d2 尾部重连出 y→b 新段（b 已属 d2）
    expect(daySegments(moved.data, "d1")).toHaveLength(0);
    const d2Segs = daySegments(moved.data, "d2");
    expect(d2Segs).toHaveLength(2);
    expect(d2Segs.map((s) => s.toStop)).toContain("b");
  });
});

describe("completeFreehand 的天归属", () => {
  it("无吸附端点时落入 fallbackDayId（编辑器当前标签）", () => {
    const data: TripData = {
      days: [
        { id: "d1", name: "第 1 天" },
        { id: "d2", name: "第 2 天" },
      ],
      stops: [],
      segments: [],
    };
    const r = completeFreehand(data, [[0, 0], [1, 1]], "walking", "d2");
    expect(r.data.stops.map((s) => s.dayId)).toEqual(["d2", "d2"]);
  });

  it("fallbackDayId 未提供时回落 days[0]", () => {
    const data: TripData = {
      days: [
        { id: "d1", name: "第 1 天" },
        { id: "d2", name: "第 2 天" },
      ],
      stops: [],
      segments: [],
    };
    const r = completeFreehand(data, [[0, 0], [1, 1]], "walking");
    expect(r.data.stops.map((s) => s.dayId)).toEqual(["d1", "d1"]);
  });

  it("吸附端点优先于 fallbackDayId", () => {
    const b = stop("b", 0, "B");
    const data: TripData = {
      days: [
        { id: "d1", name: "第 1 天" },
        { id: "d2", name: "第 2 天" },
      ],
      stops: [{ ...b, dayId: "d2" }],
      segments: [],
    };
    // 首端吸附 d2 的站点 b，即使 fallback 是 d1 也落入 d2
    const r = completeFreehand(data, [[b.lng + 0.0005, b.lat], [5, 5]], "cycling", "d1");
    expect(r.data.stops.find((s) => s.name === "绘制终点")!.dayId).toBe("d2");
  });
});

describe("addDay / nextActiveAfterDayRemoved（active 天协调）", () => {
  it("addDay 返回新天 id（store 用其切换 active）", () => {
    const r = addDay(emptyData());
    expect(r.addedId).toBe(r.data.days[1].id);
  });

  it("删除非选中天时 active 保持不变", () => {
    const days = [
      { id: "d1", name: "第 1 天" },
      { id: "d2", name: "第 2 天" },
      { id: "d3", name: "第 3 天" },
    ];
    expect(nextActiveAfterDayRemoved(days, "d2", "d1")).toBe("d1");
    expect(nextActiveAfterDayRemoved(days, "d1", null)).toBeNull();
  });

  it("删除选中天时迁移到相邻天（优先后一天）", () => {
    const days = [
      { id: "d1", name: "第 1 天" },
      { id: "d2", name: "第 2 天" },
      { id: "d3", name: "第 3 天" },
    ];
    expect(nextActiveAfterDayRemoved(days, "d2", "d2")).toBe("d3");
    expect(nextActiveAfterDayRemoved(days, "d3", "d3")).toBe("d2");
    expect(nextActiveAfterDayRemoved(days, "d1", "d1")).toBe("d2");
  });

  it("删除唯一天时 active 回退 null", () => {
    const days = [{ id: "d1", name: "第 1 天" }];
    expect(nextActiveAfterDayRemoved(days, "d1", "d1")).toBeNull();
  });
});