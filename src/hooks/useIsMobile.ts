"use client";

import { useEffect, useState } from "react";

const QUERY = "(max-width: 767px)";

/**
 * 断点判定：<768px 走移动布局（地图全屏 + 底部抽屉），≥768px 桌面双栏。
 * matchMedia 驱动；无 matchMedia 环境（如 SSR/jsdom）默认非移动。
 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mql = window.matchMedia(QUERY);
    const update = () => setMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return mobile;
}