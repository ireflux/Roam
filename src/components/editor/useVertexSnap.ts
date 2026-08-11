"use client";

import { useEffect, useRef } from "react";
import type { AmapMap, AmapOverlay } from "@/lib/mapTypes";
import type { Position, TripData, TripSegment } from "@/lib/types";
import { simplifyVertexIndices } from "@/lib/trip/geo";
import { updateSegmentLinePath } from "@/lib/mapOverlays";

const MAX_VERTICES = 24;

/**
 * 改线工具：为选中线段绘制可拖拽顶点（自由线、自动路线、已改线段均可；公交/地铁段改线后降级为普通线）。
 * AMap 的轨迹纠偏 API 需要完整 GPS 轨迹，
 * 所以单个顶点仍由用户手动拖拽。
 * 拖拽过程中只指令式更新该段 Polyline（不写 store），
 * dragend 才提交到 store，避免每帧整图重建导致被拖 marker 销毁。
 *
 * 覆盖物生命周期与位置同步拆成两个 effect：
 * - Effect A 仅在段 id 变化（或变为 null）时重建/清理 marker，避免同段数据更新
 *   （并发路由响应、undo/redo 等）触发 effect 重跑而销毁正在拖拽的 marker，
 *   导致 dragend 永不触发、改线静默丢失；
 * - Effect B 在坐标引用变化时指令式同步 marker 位置，拖拽中的顶点跳过，不打断用户操作。
 */
export function useVertexSnap(
  map: AmapMap | null,
  active: boolean,
  data: TripData,
  selectedSegId: string | null,
  onMove: (segId: string, vertexIndex: number, position: Position, commit: boolean) => void,
) {
  const overlaysRef = useRef<AmapOverlay[]>([]);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  const activeSeg: TripSegment | null =
    active ? data.segments.find((segment) => segment.id === selectedSegId) ?? null : null;

  /** 最新段引用：事件处理器经它读取最新坐标，避免闭包捕获过期数据。 */
  const activeSegRef = useRef<TripSegment | null>(null);
  useEffect(() => {
    activeSegRef.current = activeSeg;
  }, [activeSeg]);
  /** 正在拖拽的顶点下标（srcIndex）；拖拽中 Effect B 跳过该顶点，不打断用户操作。 */
  const draggingRef = useRef<number | null>(null);

  // Effect A：段 id 变化或变为 null 时重建/清理顶点 marker
  useEffect(() => {
    if (!map || !window.AMap) return;
    try {
      map.remove(overlaysRef.current);
    } catch {
      // map 实例可能已被 MapView 销毁（路由切换时序）
    }
    overlaysRef.current = [];
    draggingRef.current = null;
    const seg = activeSegRef.current;
    if (!seg || seg.geometry.coordinates.length < 3) return;

    // 均匀采样后把「采样序号」反映射回原始顶点下标，避免编辑错位
    const srcIndices = simplifyVertexIndices(seg.geometry.coordinates.length, MAX_VERTICES).slice(1, -1);
    const overlays = srcIndices.map((srcIndex) => {
      const position = seg.geometry.coordinates[srcIndex];
      const marker = new window.AMap!.Marker({
        position,
        draggable: true,
        // 20px 触达区（手机端也够点）：外圈半透明保证可见性
        content:
          '<span style="display:block;width:12px;height:12px;border:3px solid white;border-radius:50%;background:#7c3aed;box-shadow:0 0 0 6px rgba(124,58,237,.25)"></span>',
        anchor: "center",
      });
      marker.on("dragging", (event) => {
        draggingRef.current = srcIndex;
        const segNow = activeSegRef.current;
        if (!segNow) return;
        const coords = segNow.geometry.coordinates.slice();
        coords[srcIndex] = [event.lnglat.getLng(), event.lnglat.getLat()];
        updateSegmentLinePath(map, segNow.id, coords);
      });
      marker.on("dragend", (event) => {
        const segNow = activeSegRef.current;
        draggingRef.current = null;
        if (!segNow) return;
        onMoveRef.current(segNow.id, srcIndex, [event.lnglat.getLng(), event.lnglat.getLat()], true);
      });
      return marker;
    });
    try {
      map.add(overlays);
    } catch {
      // 同上
    }
    overlaysRef.current = overlays;
    return () => {
      try {
        map.remove(overlays);
      } catch {
        // 同上
      }
    };
  }, [map, activeSeg?.id]);

  // Effect B：坐标引用变化时同步 marker 位置（拖拽中的顶点跳过，不打断）
  useEffect(() => {
    if (!map || !window.AMap) return;
    const seg = activeSegRef.current;
    if (!seg || seg.geometry.coordinates.length < 3) return;
    const coords = seg.geometry.coordinates;
    const srcIndices = simplifyVertexIndices(coords.length, MAX_VERTICES).slice(1, -1);
    srcIndices.forEach((srcIndex, i) => {
      if (draggingRef.current === srcIndex) return;
      overlaysRef.current[i]?.setPosition?.(coords[srcIndex]);
    });
  }, [map, activeSeg?.geometry.coordinates]);
}