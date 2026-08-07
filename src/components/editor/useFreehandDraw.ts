"use client";

import { useEffect, useRef } from "react";
import type { AmapMap, AmapOverlay } from "@/lib/mapTypes";
import type { Position } from "@/lib/types";

export function useFreehandDraw(map: AmapMap | null, active: boolean, onCommit: (points: Position[]) => void) {
  const drawingRef = useRef(false);
  const pointsRef = useRef<Position[]>([]);
  const lineRef = useRef<AmapOverlay | null>(null);
  const onCommitRef = useRef(onCommit);
  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);

  useEffect(() => {
    if (!map || !window.AMap) return;
    if (!active) {
      drawingRef.current = false;
      pointsRef.current = [];
      lineRef.current?.setMap(null);
      lineRef.current = null;
      return;
    }
    // 拖拽禁用/启用由 MapLayers 依据 tool 单点控制（dragEnable: tool !== "draw"），
    // 此处不再触碰地图状态，避免恢复时序问题。
    const position = (event: { lnglat: { getLng(): number; getLat(): number } }): Position => [event.lnglat.getLng(), event.lnglat.getLat()];
    const onDown = (event: { lnglat: { getLng(): number; getLat(): number }; originalEvent?: MouseEvent }) => {
      if (event.originalEvent?.button !== undefined && event.originalEvent.button !== 0) return;
      drawingRef.current = true;
      pointsRef.current = [position(event)];
      lineRef.current?.setMap(null);
      lineRef.current = new window.AMap!.Polyline({ path: pointsRef.current, strokeColor: "#0d9488", strokeWeight: 5, strokeStyle: "dashed" });
      map.add(lineRef.current);
    };
    const onMove = (event: { lnglat: { getLng(): number; getLat(): number } }) => {
      if (!drawingRef.current) return;
      pointsRef.current.push(position(event));
      lineRef.current?.setPath?.(pointsRef.current);
    };
    const onUp = () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      const points = pointsRef.current;
      pointsRef.current = [];
      lineRef.current?.setMap(null);
      lineRef.current = null;
      if (points.length >= 2) onCommitRef.current(points);
    };
    map.on("mousedown", onDown);
    map.on("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      map.off("mousedown", onDown);
      map.off("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [map, active]);
}
