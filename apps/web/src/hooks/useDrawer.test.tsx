// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDrawer } from "@/hooks/useDrawer";

describe("useDrawer", () => {
  it("初始档位为 half", () => {
    const { result } = renderHook(() => useDrawer());
    expect(result.current.level).toBe("half");
  });

  it("half 向上拖超过阈值 → full", () => {
    const { result } = renderHook(() => useDrawer("half"));
    act(() => result.current.dragStart(300));
    act(() => result.current.dragMove(300 - 80));
    act(() => result.current.dragEnd(300 - 80));
    expect(result.current.level).toBe("full");
  });

  it("half 向下拖超过阈值 → collapsed", () => {
    const { result } = renderHook(() => useDrawer("half"));
    act(() => result.current.dragStart(100));
    act(() => result.current.dragMove(100 + 80));
    act(() => result.current.dragEnd(100 + 80));
    expect(result.current.level).toBe("collapsed");
  });

  it("full 下拉 → half", () => {
    const { result } = renderHook(() => useDrawer("full"));
    act(() => result.current.dragStart(100));
    act(() => result.current.dragMove(100 + 80));
    act(() => result.current.dragEnd(100 + 80));
    expect(result.current.level).toBe("half");
  });

  it("collapsed 上拉 → full", () => {
    const { result } = renderHook(() => useDrawer("collapsed"));
    act(() => result.current.dragStart(300));
    act(() => result.current.dragMove(200));
    act(() => result.current.dragEnd(200));
    expect(result.current.level).toBe("full");
  });

  it("位移未过阈值回弹不改档位", () => {
    const { result } = renderHook(() => useDrawer("half"));
    act(() => result.current.dragStart(100));
    act(() => result.current.dragMove(130));
    act(() => result.current.dragEnd(130));
    expect(result.current.level).toBe("half");
  });

  it("collapse 自动收起档记原档位，restore 恢复", () => {
    const { result } = renderHook(() => useDrawer("full"));
    act(() => result.current.collapse());
    expect(result.current.level).toBe("collapsed");
    act(() => result.current.restore());
    expect(result.current.level).toBe("full");
  });

  it("用户主动收起到 collapsed 后 restore 恢复为 half（兜底）", () => {
    const { result } = renderHook(() => useDrawer());
    act(() => result.current.collapse());
    act(() => result.current.collapse()); // 重复收起不应覆盖 prev
    act(() => result.current.restore());
    expect(result.current.level).toBe("half");
  });

  it("toggleFull 在 half/full 间切换", () => {
    const { result } = renderHook(() => useDrawer("half"));
    act(() => result.current.toggleFull());
    expect(result.current.level).toBe("full");
    act(() => result.current.toggleFull());
    expect(result.current.level).toBe("half");
  });
});