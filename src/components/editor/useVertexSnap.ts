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

  useEffect(() => {
    if (!map || !window.AMap) return;
    map.remove(overlaysRef.current);
    overlaysRef.current = [];
    if (!activeSeg || activeSeg.geometry.coordinates.length < 3) return;

    // 均匀采样后把「采样序号」反映射回原始顶点下标，避免编辑错位
    const srcIndices = simplifyVertexIndices(activeSeg.geometry.coordinates.length, MAX_VERTICES).slice(1, -1);
    const overlays = srcIndices.map((srcIndex) => {
      const position = activeSeg.geometry.coordinates[srcIndex];
      const marker = new window.AMap!.Marker({
        position,
        draggable: true,
        content: '<span style="display:block;width:12px;height:12px;border:2px solid white;border-radius:50%;background:#7c3aed"></span>',
        anchor: "center",
      });
      marker.on("dragging", (event) => {
        const coords = activeSeg.geometry.coordinates.slice();
        coords[srcIndex] = [event.lnglat.getLng(), event.lnglat.getLat()];
        updateSegmentLinePath(map, activeSeg.id, coords);
      });
      marker.on("dragend", (event) => {
        onMoveRef.current(activeSeg.id, srcIndex, [event.lnglat.getLng(), event.lnglat.getLat()], true);
      });
      return marker;
    });
    map.add(overlays);
    overlaysRef.current = overlays;
    return () => map.remove(overlays);
  }, [map, activeSeg]);
}