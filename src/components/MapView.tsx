"use client";

import { useEffect, useRef, useState } from "react";
import type { AmapMap } from "@/lib/mapTypes";

export const DEFAULT_CENTER: [number, number] = [104.1954, 35.8617];
export const DEFAULT_ZOOM = 4;

function loadAmap(key: string, securityJsCode?: string): Promise<void> {
  if (window.AMap) return Promise.resolve();
  if (securityJsCode) window._AMapSecurityConfig = { securityJsCode };
  return new Promise((resolve, reject) => {
    // 移除残留脚本（例如旧代码产生的 v=2.1，它不会定义 window.AMap），避免永远等不到 load 事件
    document.querySelector<HTMLScriptElement>('script[data-amap-js-api="true"]')?.remove();
    const script = document.createElement("script");
    script.dataset.amapJsApi = "true";
    // 官方文档：JS API 2.0 的版本号固定为 v=2.0（https://lbs.amap.com/api/javascript-api-v2/guide/abc/load）
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("高德地图脚本加载失败"));
    document.head.appendChild(script);
  });
}

function loadToolbar(): Promise<void> {
  return new Promise((resolve) => {
    if (!window.AMap) return resolve();
    if (window.AMap.ToolBar) return resolve();
    window.AMap.plugin(["AMap.ToolBar"], () => resolve());
  });
}

export default function MapView({ className, onLoad }: { className?: string; onLoad?: (map: AmapMap) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onLoadRef = useRef(onLoad);
  const [error, setError] = useState<string | null>(null);
  const key = process.env.NEXT_PUBLIC_AMAP_JS_API_KEY;

  useEffect(() => { onLoadRef.current = onLoad; }, [onLoad]);

  useEffect(() => {
    if (!key) return;
    let map: AmapMap | null = null;
    let cancelled = false;
    let sizeObserver: ResizeObserver | null = null;

    const initMap = (): boolean => {
      const container = containerRef.current;
      if (!container || !window.AMap || map) return true;
      // 容器尚无尺寸时初始化会白屏，先等待其获得尺寸
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;

      map = new window.AMap.Map(container, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        viewMode: "2D",
        resizeEnable: true,
      });

      if (window.AMap.ToolBar) {
        map.add(new window.AMap.ToolBar());
      }

      // 容器尺寸变化时主动触发重绘，防止 Flex/绝对定位导致的白屏
      const resizeObserver = new ResizeObserver(() => {
        map?.resize();
      });
      resizeObserver.observe(container);

      // 初次挂载后再触发一次 resize，确保瓦片正确加载
      requestAnimationFrame(() => map?.resize());

      onLoadRef.current?.(map);
      return true;
    };

    void loadAmap(key, process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE)
      .then(() => loadToolbar())
      .then(() => {
        if (cancelled) return;
        if (initMap()) return;
        const container = containerRef.current;
        if (!container) return;
        sizeObserver = new ResizeObserver(() => {
          if (initMap()) sizeObserver?.disconnect();
        });
        sizeObserver.observe(container);
      })
      .catch(() => !cancelled && setError("高德地图加载失败，请检查 Key 的域名白名单与网络连接"));

    return () => {
      cancelled = true;
      sizeObserver?.disconnect();
      map?.destroy();
    };
  }, [key]);

  const message = !key ? "未配置高德 JS API Key" : error;
  return <div ref={containerRef} className={className}>{message && <div className="flex h-full items-center justify-center bg-zinc-100 p-6 text-center text-sm text-zinc-500">{message}</div>}</div>;
}
