// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFreehandDraw } from "./useFreehandDraw";
import type { Position } from "@roam/core";
import type { AmapMap } from "@/lib/mapTypes";

/** 构造可派发 PointerEvent 的假地图容器 + 假 AMap */
function makeEnv() {
  const container = document.createElement("div");
  const added: unknown[] = [];
  class Polyline {
    setMap = vi.fn();
    setPath = vi.fn();
  }
  window.AMap = { Polyline } as unknown as typeof window.AMap;
  const map = {
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    setFitView: vi.fn(),
    destroy: vi.fn(),
    setZoomAndCenter: vi.fn(),
    getZoom: () => 10,
    getContainer: () => container,
    containerToLngLat: ([x, y]: [number, number]) => ({ getLng: () => x, getLat: () => y }),
    add: (o: unknown) => added.push(o),
  } as unknown as AmapMap;
  return { container, added, map };
}

function dispatch(container: HTMLElement, type: string, x: number, y: number, pointerId = 1) {
  const event = new window.PointerEvent(type, {
    bubbles: true,
    pointerId,
    pointerType: "mouse",
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, "offsetX", { value: x });
  Object.defineProperty(event, "offsetY", { value: y });
  container.dispatchEvent(event);
  return event;
}

describe("useFreehandDraw 手势", () => {
  it("锁定状态下拖动画线并提交", () => {
    const { container, map, added } = makeEnv();
    const onCommit = vi.fn();
    const { rerender } = renderHook(
      ({ locked }) => useFreehandDraw(map, true, locked, onCommit),
      { initialProps: { locked: true } },
    );
    dispatch(container, "pointerdown", 10, 10);
    dispatch(container, "pointermove", 30, 20);
    dispatch(container, "pointerup", 30, 20);
    expect(onCommit).toHaveBeenCalledTimes(1);
    const points = onCommit.mock.calls[0][0] as Position[];
    expect(points.some(([x]) => x > 10)).toBe(true);
    expect(added.length).toBe(1); // 绘制中有一条预览线
    rerender({ locked: true });
  });

  it("解锁状态下拖动不绘制、不提交（交给地图平移）", () => {
    const { container, map, added } = makeEnv();
    const onCommit = vi.fn();
    renderHook(() => useFreehandDraw(map, true, false, onCommit));
    const down = dispatch(container, "pointerdown", 10, 10);
    expect(down.defaultPrevented).toBe(false); // 不拦截，原生拖图可用
    dispatch(container, "pointermove", 30, 20);
    dispatch(container, "pointerup", 30, 20);
    expect(onCommit).not.toHaveBeenCalled();
    expect(added.length).toBe(0);
  });

  it("绘制过程中解锁：当前笔画继续，完成提交；之后不再绘制", () => {
    const { container, added, map } = makeEnv();
    const onCommit = vi.fn();
    const { rerender } = renderHook(
      ({ locked }) => useFreehandDraw(map, true, locked, onCommit),
      { initialProps: { locked: true } },
    );
    dispatch(container, "pointerdown", 10, 10);
    rerender({ locked: false }); // 绘制中途解锁
    dispatch(container, "pointermove", 40, 40);
    dispatch(container, "pointerup", 40, 40);
    expect(onCommit).toHaveBeenCalledTimes(1); // 当前笔迹仍是完成的一笔

    dispatch(container, "pointerdown", 50, 50);
    dispatch(container, "pointermove", 60, 60);
    dispatch(container, "pointerup", 60, 60);
    expect(onCommit).toHaveBeenCalledTimes(1); // 之后不画
    expect(added.length).toBe(1); // 仅第一笔的预览线
  });
});