"use client";

import AMapLoader from "@amap/amap-jsapi-loader";
import { useEffect, useRef, useState } from "react";
import type { AmapMap, AmapNamespace } from "@/lib/mapTypes";

export const DEFAULT_CENTER: [number, number] = [104.1954, 35.8617];
export const DEFAULT_ZOOM = 4;

// 生产环境安全配置（skill 最佳实践）：
// 若配置 NEXT_PUBLIC_AMAP_PROXY=true，前端只声明 serviceHost 指向同源代理，
// securityJsCode 仅存在于服务端（AMAP_SECURITY_JS_CODE），由 /api/amap-proxy 追加，绝不暴露到浏览器。
// 官方要求 serviceHost 以 /_AMapService 作为固定一级路由（不可省略或修改），
// 由 next.config.ts 的 rewrite 把 /_AMapService/* 转发到 /api/amap-proxy/*，
// 代理层再按路径分发到 restapi/webapi/fmap01 三个上游。
// 仅在未开启代理时使用 NEXT_PUBLIC_AMAP_SECURITY_JS_CODE（开发环境明文，2021-12-02 后创建的 key 必须）。
function applySecurityConfig() {
  if (process.env.NEXT_PUBLIC_AMAP_PROXY === "true") {
    window._AMapSecurityConfig = { serviceHost: "/_AMapService" };
  } else if (process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE) {
    window._AMapSecurityConfig = { securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE };
  }
}

export default function MapView({ className, onLoad }: { className?: string; onLoad?: (map: AmapMap | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onLoadRef = useRef(onLoad);
  const [error, setError] = useState<string | null>(null);
  const key = process.env.NEXT_PUBLIC_AMAP_JS_API_KEY;

  useEffect(() => { onLoadRef.current = onLoad; }, [onLoad]);

  useEffect(() => {
    if (!key) return;
    let map: AmapMap | null = null;
    let cancelled = false;
    let waitObserver: ResizeObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const initMap = (AMap: AmapNamespace): boolean => {
      const container = containerRef.current;
      if (container && !map && !cancelled) {
        // 容器尚无尺寸时初始化会白屏，先等待其获得尺寸
        const rect = container.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
      } else {
        return true;
      }

      map = new AMap.Map(container, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        viewMode: "2D",
        resizeEnable: true,
      });

      if (AMap.ToolBar) {
        map.add(new AMap.ToolBar());
      }

      // 容器尺寸变化时主动触发重绘；卸载时务必 disconnect，否则会在已销毁的 map 上触发回调
      resizeObserver = new ResizeObserver(() => {
        if (map && typeof map.resize === "function") map.resize();
      });
      resizeObserver.observe(container);

      // 初次挂载后再触发一次 resize，确保瓦片正确加载
      requestAnimationFrame(() => {
        if (map && typeof map.resize === "function") map.resize();
      });

      onLoadRef.current?.(map);
      return true;
    };

    // 官方规范：JSAPI 2.0 安全配置必须在 AMapLoader.load 之前设置
    applySecurityConfig();

    // 官方推荐的加载方式：https://lbs.amap.com/api/javascript-api-v2/guide/abc/load
    AMapLoader.load({ key, version: "2.0", plugins: ["AMap.ToolBar"] })
      .then((AMap: AmapNamespace) => {
        if (cancelled) return;
        if (initMap(AMap)) return;
        const container = containerRef.current;
        if (!container) return;
        waitObserver = new ResizeObserver(() => {
          if (initMap(AMap)) waitObserver?.disconnect();
        });
        waitObserver.observe(container);
      })
      .catch((e) => {
        if (!cancelled) setError(`高德地图加载失败：${(e && e.message) || e}`);
      });

    return () => {
      cancelled = true;
      waitObserver?.disconnect();
      resizeObserver?.disconnect();
      map?.destroy();
      // 通知调用方 map 已销毁：否则全局 store 会残留已销毁实例，
      // 下次进入编辑器时 MapLayers 在其上 add() 直接抛错导致整页崩溃
      onLoadRef.current?.(null);
    };
  }, [key]);

  const message = !key ? "未配置高德 JS API Key" : error;
  // 高德运行时会为容器注入未分层的 .amap-container 样式（position:relative 等），
  // 其优先级高于 Tailwind v4 的 @layer utilities，会覆盖 .absolute 导致容器塌陷白屏。
  // 因此定位类（absolute inset-0）放在外层 wrapper 上，地图容器只用 h-full w-full 撑满。
  return (
    <div className={className}>
      <div data-testid="map-container" ref={containerRef} className="h-full w-full" />
      {message && (
        <div className="absolute inset-0 flex items-center justify-center bg-paper p-6 text-center text-sm text-muted">
          {message}
        </div>
      )}
    </div>
  );
}