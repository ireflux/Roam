// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import MapLayers from "./MapLayers";
import { useTripStore } from "@/lib/useTripStore";
import type { AmapMap } from "@/lib/mapTypes";
import type { Trip, TripSegment } from "@/lib/types";

/** 假 AMap：记录 add/remove 的覆盖物；Marker 保留实例供断言 */
function makeEnv(initialZoom = 12) {
  let zoom = initialZoom;
  const added: unknown[] = [];
  const markers: Array<{ content: string; position: [number, number]; setVisible: ReturnType<typeof vi.fn> }> = [];
  const handlers: Record<string, () => void> = {};
  class Marker {
    content: string;
    position: [number, number];
    on = vi.fn();
    setContent = vi.fn();
    setPosition = vi.fn();
    setOptions = vi.fn();
    setVisible = vi.fn();
    constructor(opts: Record<string, unknown>) {
      this.content = opts.content as string;
      this.position = opts.position as [number, number];
      added.push(this);
      markers.push(this);
    }
  }
  class Polyline {
    constructor() {
      added.push(this);
    }
    on = vi.fn();
    setPath = vi.fn();
    setOptions = vi.fn();
  }
  window.AMap = { Marker, Polyline } as unknown as typeof window.AMap;
  const map = {
    on: (event: string, fn: () => void) => (handlers[event] = fn),
    off: vi.fn(),
    add: (o: unknown) => added.push(o),
    remove: vi.fn(),
    getZoom: () => zoom,
    setZoomAndCenter: vi.fn(),
    setFitView: vi.fn(),
    setStatus: vi.fn(),
    setDefaultCursor: vi.fn(),
    destroy: vi.fn(),
    getContainer: () => document.createElement("div"),
    containerToLngLat: () => ({ getLng: () => 0, getLat: () => 0 }),
  } as unknown as AmapMap;
  return { map, added, markers, setZoom: (z: number) => (zoom = z), zoomend: () => handlers.zoomend?.() };
}

const DAY = "d1";

function tripWith(segInput: TripSegment): Trip {
  return {
    id: "t1",
    shareId: "s1",
    ownerId: "o1",
    title: "t",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    data: {
      days: [{ id: DAY, name: "第 1 天" }],
      stops: [
        { id: "a", dayId: DAY, name: "A", lat: 31.23, lng: 121.47, order: 0 },
        { id: "b", dayId: DAY, name: "B", lat: 31.233, lng: 121.475, order: 1 },
      ],
      segments: [segInput],
    },
  };
}

function seg(opts: Partial<TripSegment> = {}): TripSegment {
  return {
    id: "s1",
    fromStop: "a",
    toStop: "b",
    mode: "cycling",
    kind: "auto",
    geometry: { type: "LineString", coordinates: [[121.47, 31.23], [121.472, 31.231], [121.475, 31.233]] },
    distanceM: 500,
    durationMin: 5,
    ...opts,
  };
}

function modeLabel(markers: ReturnType<typeof makeEnv>["markers"]): (typeof markers)[number] | undefined {
  return markers.find((m) => /骑行|步行|驾车|公交|已降级/.test(m.content));
}

describe("MapLayers 线段方式标签", () => {
  it("zoom 达阈值时为 auto 段创建中点标签（含方式名，位于路径中部）", () => {
    const env = makeEnv();
    useTripStore.getState().load(tripWith(seg()));
    render(<MapLayers map={env.map} dragLocked={false} />);
    const label = modeLabel(env.markers)!;
    expect(label).toBeTruthy();
    expect(label.content).toContain("骑行");
    // 位置贴近路径中段，而非首尾端点
    expect(label.position[0]).toBeGreaterThan(121.4705);
    expect(label.position[0]).toBeLessThan(121.475);
    expect(label.setVisible).toHaveBeenCalledWith(true);
  });

  it("降级段标「已降级」；手绘段不标", () => {
    const degraded = makeEnv();
    useTripStore.getState().load(tripWith(seg({ degraded: true })));
    render(<MapLayers map={degraded.map} dragLocked={false} />);
    expect(modeLabel(degraded.markers)!.content).toContain("已降级");

    const freehand = makeEnv();
    useTripStore.getState().load(tripWith(seg({ kind: "freehand" })));
    render(<MapLayers map={freehand.map} dragLocked={false} />);
    expect(modeLabel(freehand.markers)).toBeUndefined();
  });

  it("zoomend 低于阈值隐藏全部标签，恢复后重新显示", () => {
    const env = makeEnv();
    useTripStore.getState().load(tripWith(seg()));
    render(<MapLayers map={env.map} dragLocked={false} />);
    const label = modeLabel(env.markers)!;

    env.setZoom(10);
    env.zoomend();
    expect(label.setVisible).toHaveBeenLastCalledWith(false);

    env.setZoom(13);
    env.zoomend();
    expect(label.setVisible).toHaveBeenLastCalledWith(true);
  });
});