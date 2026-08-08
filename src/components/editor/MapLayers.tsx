"use client";

import { useEffect, useRef } from "react";
import type { AmapMap, AmapOverlay } from "@/lib/mapTypes";
import type { Position, TripData, TripSegment } from "@/lib/types";
import { useTripStore } from "@/lib/useTripStore";
import { setSegmentLine } from "@/lib/mapOverlays";

const EMPTY_DATA: TripData = { days: [], stops: [], segments: [] };
const COLORS = { driving: "#2563eb", walking: "#059669", cycling: "#ea580c", transit: "#0891b2", freehand: "#71717a", snapped: "#7c3aed", degraded: "#d97706" };

function stopContent(label: string, selected: boolean) {
  return `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;border:2px solid ${selected ? "#0f766e" : "#059669"};background:${selected ? "#0d9488" : "#fff"};color:${selected ? "#fff" : "#065f46"};font:600 11px Arial">${label}</span>`;
}

/** 段样式：降级（琥珀虚线）优先于手绘/吸附/出行方式的常规配色。 */
function segmentStyle(segment: TripSegment, partKind: string) {
  const color = segment.degraded
    ? COLORS.degraded
    : segment.kind === "snapped"
      ? COLORS.snapped
      : segment.kind === "freehand"
        ? COLORS.freehand
        : COLORS[segment.mode];
  return {
    strokeColor: color,
    strokeWeight: 4,
    strokeOpacity: 0.85,
    strokeStyle: segment.degraded || partKind === "walking" ? "dashed" : undefined,
  };
}

/** 每天内按 order 排序后每个站点的编号（1 起）。 */
function stopLabels(data: TripData): Map<string, string> {
  const byDay = new Map<string, { id: string; order: number }[]>();
  for (const stop of data.stops) {
    const list = byDay.get(stop.dayId) ?? [];
    list.push({ id: stop.id, order: stop.order });
    byDay.set(stop.dayId, list);
  }
  const labels = new Map<string, string>();
  for (const list of byDay.values()) {
    list.sort((a, b) => a.order - b.order);
    list.forEach((s, i) => labels.set(s.id, String(i + 1)));
  }
  return labels;
}

// 覆盖物 click 会冒泡到地图（skill 事件文档），若地图 click 立即跟随处理，
// 会在选中后立刻被 selectStop(null) 清掉。用时间戳守卫：覆盖物点击后 ~60ms 内
// 的地图 click 视为冒泡事件直接忽略。未触发冒泡时守卫会自然过期，不影响空白区点击。
let lastOverlayClickAt = 0;

interface MapLayersProps {
  map: AmapMap | null;
  /** true 时地图禁止平移拖拽（绘制/改线模式；双指缩放仍可用）。 */
  dragLocked: boolean;
}

export default function MapLayers({ map, dragLocked }: MapLayersProps) {
  const trip = useTripStore((s) => s.trip);
  const tool = useTripStore((s) => s.tool);
  const selectedStopId = useTripStore((s) => s.selectedStopId);
  const selectedSegId = useTripStore((s) => s.selectedSegId);
  const linesRef = useRef<Map<string, AmapOverlay[]>>(new Map());
  const markersRef = useRef<Map<string, AmapOverlay>>(new Map());
  /** overlay 归属的地图实例：map 实例变化（组件重挂载/StrictMode）时丢弃旧注册表，整图重建。 */
  const overlaysMapRef = useRef<AmapMap | null>(null);
  const data = trip?.data ?? EMPTY_DATA;

  // 增量同步：只对新增/删除/变化的段与站点增删改，不做全量重建。
  useEffect(() => {
    if (!map || !window.AMap) return;
    if (overlaysMapRef.current !== map) {
      // 新地图实例：旧 overlay 属于已销毁的 map，直接丢弃引用，不 touch
      overlaysMapRef.current = map;
      linesRef.current.clear();
      markersRef.current.clear();
    }

    try {
      const segmentIds = new Set(data.segments.map((s) => s.id));
      for (const [segId, lines] of linesRef.current) {
        if (segmentIds.has(segId)) continue;
        map.remove(lines);
        linesRef.current.delete(segId);
      }
      const stopIds = new Set(data.stops.map((s) => s.id));
      for (const [stopId, marker] of markersRef.current) {
        if (stopIds.has(stopId)) continue;
        map.remove(marker);
        markersRef.current.delete(stopId);
      }
    } catch {
      // 防御：map 实例可能已被 MapView 销毁（路由切换时序）
    }

    const labels = stopLabels(data);

    for (const segment of data.segments) {
      const parts: { kind: "transit" | "walking"; coordinates: Position[] }[] =
        segment.parts && segment.parts.length > 0
          ? segment.parts
          : [{ kind: segment.mode as "transit" | "walking", coordinates: segment.geometry.coordinates }];
      const existing = linesRef.current.get(segment.id);
      if (existing && existing.length === parts.length) {
        // 子段数量未变：仅更新路径与样式，不销毁重建
        parts.forEach((part, i) => {
          existing[i]?.setPath?.(part.coordinates);
          existing[i]?.setOptions?.(segmentStyle(segment, part.kind));
        });
        continue;
      }
      // 新建（或子段数量变化后的重建）
      if (existing) {
        try {
          map.remove(existing);
        } catch {
          // 同上
        }
        linesRef.current.delete(segment.id);
      }
      const lines = parts.map((part) => new window.AMap!.Polyline({
        path: part.coordinates,
        ...segmentStyle(segment, part.kind),
        lineJoin: "round",
      }));
      for (const line of lines.slice(0, 1)) setSegmentLine(map, segment.id, line);
      for (const line of lines) {
        line.on("click", () => {
          lastOverlayClickAt = performance.now();
          useTripStore.getState().selectSeg(segment.id);
        });
      }
      try {
        map.add(lines);
      } catch {
        // 同上
      }
      linesRef.current.set(segment.id, lines);
    }

    for (const stop of data.stops) {
      const label = labels.get(stop.id) ?? "";
      const existing = markersRef.current.get(stop.id);
      if (existing) {
        existing.setPosition?.([stop.lng, stop.lat]);
        existing.setContent?.(stopContent(label, false));
        continue;
      }
      const marker = new window.AMap!.Marker({
        position: [stop.lng, stop.lat],
        content: stopContent(label, false),
        anchor: "center",
      });
      marker.on("click", () => {
        lastOverlayClickAt = performance.now();
        useTripStore.getState().selectStop(stop.id);
      });
      try {
        map.add(marker);
      } catch {
        // 同上
      }
      markersRef.current.set(stop.id, marker);
    }
  }, [map, data]);

  // 选中态仅做指令式样式更新，不重建覆盖物
  useEffect(() => {
    if (!map) return;
    for (const segment of data.segments) {
      const lines = linesRef.current.get(segment.id);
      const selected = segment.id === selectedSegId;
      lines?.forEach((line) => {
        line.setOptions?.({
          strokeWeight: selected ? 6 : 4,
          strokeOpacity: selected ? 1 : 0.85,
        });
      });
    }
    for (const stop of data.stops) {
      const marker = markersRef.current.get(stop.id);
      if (!marker?.setContent) continue;
      marker.setContent(stopContent(stopLabels(data).get(stop.id) ?? "", stop.id === selectedStopId));
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

  // 绘制/改线时禁止平移（dragLocked），双指缩放照常；切换工具恢复
  useEffect(() => {
    if (!map) return;
    map.setDefaultCursor(tool === "add" ? "crosshair" : tool === "draw" ? "copy" : "default");
    map.setStatus({ dragEnable: !dragLocked });
  }, [map, tool, dragLocked]);

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
