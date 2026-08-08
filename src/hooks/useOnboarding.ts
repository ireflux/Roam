"use client";

import { useCallback, useMemo, useState } from "react";

export type OnboardingHintKey = "draw" | "snap" | "add" | "delete" | "degrade";

const STORAGE_KEY = "roam_onb";

interface OnboardingState {
  l0Done: boolean;
  hints: Record<OnboardingHintKey, boolean>;
}

const EMPTY: OnboardingState = { l0Done: false, hints: { draw: false, snap: false, add: false, delete: false, degrade: false } };

function read(): OnboardingState {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // 隐私模式/被禁用时静默降级：不引导
    return { ...EMPTY, l0Done: true };
  }
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      l0Done: !!parsed.l0Done,
      hints: { ...EMPTY.hints, ...(parsed.hints ?? {}) },
    };
  } catch {
    // 数据损坏回退到默认（未引导）状态
    return EMPTY;
  }
}

function write(state: OnboardingState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 同上，静默失败
  }
}

/**
 * 分层引导状态（L0 欢迎层 + L1 情境提示），localStorage 持久化，跨 trip 唯一。
 * 所有提示只出现一次；存储异常时直接表现为「已完成」，不重复打扰用户。
 */
export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(() =>
    typeof window === "undefined" ? EMPTY : read(),
  );

  const finishL0 = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, l0Done: true };
      write(next);
      return next;
    });
  }, []);

  const seenHint = useCallback(
    (key: OnboardingHintKey) => state.hints[key],
    [state.hints],
  );

  const markHintSeen = useCallback((key: OnboardingHintKey) => {
    setState((prev) => {
      if (prev.hints[key]) return prev;
      const next = { ...prev, hints: { ...prev.hints, [key]: true } };
      write(next);
      return next;
    });
  }, []);

  return useMemo(
    () => ({ l0Done: state.l0Done, seenHint, markHintSeen, finishL0 }),
    [state.l0Done, seenHint, markHintSeen, finishL0],
  );
}