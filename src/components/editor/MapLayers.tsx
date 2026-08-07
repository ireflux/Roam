"use client";

import { useEffect, useRef } from "react";
import type { AmapMap, AmapOverlay } from "@/lib/mapTypes";
import type { TripData } from "@/lib/types";
import { useTripStore } from "@/lib/useTripStore";
import { setSegmentLine } from "@/lib/mapOverlays";

const EMPTY_DATA: TripData = { days: [], stops: [], segments: [] };
const COLORS = { driving: "#2563eb", walking: "#059669", cycling: "#ea580c", transit: "#0891b2", freehand: "#71717a", snapped: "#7c3aed" };

function stopContent(label: string, selected: boolean) {
  return `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;border:2px solid ${selected ? "#0f766e" : "#059669"};background:${selected ? "#0d9488" : "#fff"};color:${selected ? "#fff" : "#065f46"};font:600 11px Arial">${label}</span>`;
}

// 覆盖物 click 会冒泡到地图（skill 事件文档），若地图 click 立即跟随处理，
// 会在选中后立刻被 selectStop(null) 清掉。用时间戳守卫：覆盖物点击后 ~60ms 内
// 的地图 click 视为冒泡事件直接忽略。未触发冒泡时守卫会自然过期，不影响空白区点击。
let lastOverlayClickAt = 0;

export default function MapLayers({ map }: { map: AmapMap | null }) {
  const trip = useTripStore((s) => s.trip);
  const tool = useTripStore((s) => s.tool);
  const selectedStopId = useTripStore((s) => s.selectedStopId);
  const selectedSegId = useTripStore((s) => s.selectedSegId);
  const linesRef = useRef<Map<string, AmapOverlay[]>>(new Map());
  const markersRef = useRef<Map<string, AmapOverlay>>(new Map());
  const data = trip?.data ?? EMPTY_DATA;

  // 数据/地图变化时才整体重建覆盖物；选中态变化走下方独立 effect，避免点击即整图重建
  useEffect(() => {
    if (!map || !window.AMap) return;
    try {
      const prev: AmapOverlay[] = [];
      for (const lines of linesRef.current.values()) prev.push(...lines);
      prev.push(...markersRef.current.values());
      map.remove(prev);
    } catch {
      // 防御：map 实例可能已被 MapView 销毁（dev StrictMode 双执行/路由切换时序）
    }
    linesRef.current.clear();
    markersRef.current.clear();

    const overlays: AmapOverlay[] = [];
    for (const segment of data.segments) {
      const color = segment.kind === "snapped" ? COLORS.snapped : segment.kind === "freehand" ? COLORS.freehand : COLORS[segment.mode];
      // 公交/地铁：按子段渲染（公交实线 + 步行虚线），展示换乘；其余出行方式为单条 Polyline
      const lines: AmapOverlay[] = (segment.parts && segment.parts.length > 0
        ? segment.parts
        : [{ kind: segment.mode as "transit" | "walking" | "driving" | "cycling", coordinates: segment.geometry.coordinates }]
      ).map((part) => new window.AMap!.Polyline({
        path: part.coordinates,
        strokeColor: color,
        strokeWeight: 4,
        strokeOpacity: 0.85,
        strokeStyle: part.kind === "walking" ? "dashed" : undefined,
        lineJoin: "round",
      }));
      for (const line of lines.slice(0, 1)) setSegmentLine(map, segment.id, line);
      for (const line of lines) {
        line.on("click", () => {
          lastOverlayClickAt = performance.now();
          useTripStore.getState().selectSeg(segment.id);
        });
        overlays.push(line);
      }
      linesRef.current.set(segment.id, lines);
    }
    for (const stop of data.stops) {
      const sameDay = data.stops.filter((candidate) => candidate.dayId === stop.dayId).sort((a, b) => a.order - b.order);
      const label = String(sameDay.findIndex((candidate) => candidate.id === stop.id) + 1);
      const marker = new window.AMap.Marker({ position: [stop.lng, stop.lat], content: stopContent(label, false), anchor: "center" });
      marker.on("click", () => {
        lastOverlayClickAt = performance.now();
        useTripStore.getState().selectStop(stop.id);
      });
      markersRef.current.set(stop.id, marker);
      overlays.push(marker);
    }
    try {
      map.add(overlays);
    } catch {
      // 同上：map 已销毁时静默跳过，勿让残影实例的异常击穿 React root
    }
    return () => {
      try {
        map.remove(overlays);
      } catch {
        // 同上
      }
    };
  }, [map, data]);

  // 选中态仅做指令式样式更新，不重建覆盖物
  useEffect(() => {
    if (!map) return;
    for (const segment of data.segments) {
      const lines = linesRef.current.get(segment.id);
      const selected = segment.id === selectedSegId;
      lines?.forEach((line) => {
        (line as { setOptions?: (o: Record<string, unknown>) => void } | undefined)?.setOptions?.({
          strokeWeight: selected ? 6 : 4,
          strokeOpacity: selected ? 1 : 0.85,
        });
      });
    }
    for (const stop of data.stops) {
      const marker = markersRef.current.get(stop.id);
      if (!marker?.setContent) continue;
      const sameDay = data.stops.filter((candidate) => candidate.dayId === stop.dayId).sort((a, b) => a.order - b.order);
      const label = String(sameDay.findIndex((candidate) => candidate.id === stop.id) + 1);
      marker.setContent(stopContent(label, stop.id === selectedStopId));
    }
  }, [map, data, selectedSegId, selectedStopId]);

  useEffect(() => {
    if (!map) return;
    const onClick = (event: { lnglat: { getLng(): number; getLat(): number } }) => {
      // 覆盖物 click 冒泡到地图的守卫：60ms 内的地图 click 一律忽略
      if (performance.now() - lastOverlayClickAt < 60) return;
      const store = useTripStore.getState();
      if (store.tool === "add") {
        const id = store.addStopAt({ name: "", lng: event.lnglat.getLng(), lat: event.lnglat.getLat(), mode: store.currentMode });
        if (id) void autoNameStop(id, event.lnglat.getLng(), event.lnglat.getLat());
      } else {
        store.selectStop(null);
        store.selectSeg(null);
      }
    };
    map.on("click", onClick);
    return () => map.off("click", onClick);
  }, [map]);

  useEffect(() => {
    if (!map) return;
    map.setDefaultCursor(tool === "add" ? "crosshair" : tool === "draw" ? "copy" : "default");
    map.setStatus({ dragEnable: tool !== "draw" });
  }, [map, tool]);

  return null;
}

/** 点击地图添加的站点自动逆地理编码命名（仅当站点仍为空名时生效，尊重用户自定义）。 */
async function autoNameStop(stopId: string, lng: number, lat: number) {
  try {
    const response = await fetch(`/api/regeocode?lng=${lng}&lat=${lat}`);
    if (!response.ok) return;
    const data = (await response.json()) as { address?: string; name?: string };
    const name = data.name || data.address || "";
    useTripStore.getState().setStopName(stopId, name);
  } catch {
    // 静默失败：保留「未命名地点」，用户可手动命名
  }
}