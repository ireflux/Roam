// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnboarding } from "@/hooks/useOnboarding";

describe("useOnboarding", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("初始 L0 未完成、无已看过提示", () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.l0Done).toBe(false);
    expect(result.current.seenHint("draw")).toBe(false);
  });

  it("finishL0 持久化到 localStorage 并跨实例生效", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.finishL0());
    expect(result.current.l0Done).toBe(true);
    const persisted = JSON.parse(window.localStorage.getItem("roam_onb")!);
    expect(persisted.l0Done).toBe(true);
    const second = renderHook(() => useOnboarding());
    expect(second.result.current.l0Done).toBe(true);
  });

  it("markHintSeen 只对未看过的 key 生效一次", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.markHintSeen("draw"));
    expect(result.current.seenHint("draw")).toBe(true);
    const raw = window.localStorage.getItem("roam_onb")!;
    act(() => result.current.markHintSeen("draw"));
    expect(window.localStorage.getItem("roam_onb")).toBe(raw);
  });

  it("隐私模式下 localStorage 不可用时视为已完成（不打扰）", () => {
    const orig = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("denied");
      },
      configurable: true,
    });
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.l0Done).toBe(true);
    Object.defineProperty(window, "localStorage", {
      value: orig,
      configurable: true,
    });
  });

  it("损坏数据回退到默认状态", () => {
    window.localStorage.setItem("roam_onb", "{bad json");
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.l0Done).toBe(false);
  });
});