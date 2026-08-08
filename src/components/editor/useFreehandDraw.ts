"use client";

import { useEffect, useRef } from "react";
import type { AmapMap, AmapOverlay } from "@/lib/mapTypes";
import type { Position } from "@/lib/types";

/**
 * 自由手绘：pointer events（覆盖 mouse + touch）。
 * 仅在绘制工具激活时挂载；绘制期间地图平移由 MapLayers 锁定（dragLocked），
 * 双指缩放不受影响 —— 第一根手指始终是绘制手指，无需手势区分。
 *
 * 解锁（dragLocked=false）时禁用绘制手势：单指拖动交给原生地图平移，
 * 重新锁定后才恢复「拖即画」。
 */
export function useFreehandDraw(
  map: AmapMap | null,
  active: boolean,
  dragLocked: boolean,
  onCommit: (points: Position[]) => void,
) {
  const drawingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const pointsRef = useRef<Position[]>([]);
  const lineRef = useRef<AmapOverlay | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const onCommitRef = useRef(onCommit);
  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);
  const lockedRef = useRef(dragLocked);
  useEffect(() => { lockedRef.current = dragLocked; }, [dragLocked]);

  useEffect(() => {
    const container = map?.getContainer?.() ?? null;
    if (!map || !window.AMap) return;
    if (!active || !container) {
      drawingRef.current = false;
      pointerIdRef.current = null;
      pointsRef.current = [];
      lineRef.current?.setMap(null);
      lineRef.current = null;
      containerRef.current = null;
      return;
    }
    containerRef.current = container;

    const toPosition = (e: PointerEvent): Position => {
      const lnglat = map.containerToLngLat([e.offsetX, e.offsetY]);
      return [lnglat.getLng(), lnglat.getLat()];
    };

    const onDown = (e: PointerEvent) => {
      if (pointerIdRef.current !== null) return; // 双指：忽略后续手指
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!lockedRef.current) return; // 已解锁：交给地图平移，不绘制
      e.preventDefault();
      pointerIdRef.current = e.pointerId;
      drawingRef.current = true;
      pointsRef.current = [toPosition(e)];
      lineRef.current?.setMap(null);
      lineRef.current = new window.AMap!.Polyline({ path: pointsRef.current, strokeColor: "#0d9488", strokeWeight: 6, strokeStyle: "dashed" });
      map.add(lineRef.current);
    };
    const onMove = (e: PointerEvent) => {
      if (!drawingRef.current || e.pointerId !== pointerIdRef.current) return;
      e.preventDefault();
      pointsRef.current.push(toPosition(e));
      lineRef.current?.setPath?.(pointsRef.current);
    };
    const finish = (e: PointerEvent) => {
      if (!drawingRef.current || e.pointerId !== pointerIdRef.current) return;
      pointerIdRef.current = null;
      drawingRef.current = false;
      const points = pointsRef.current;
      pointsRef.current = [];
      lineRef.current?.setMap(null);
      lineRef.current = null;
      if (points.length >= 2) onCommitRef.current(points);
    };

    container.addEventListener("pointerdown", onDown);
    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerup", finish);
    container.addEventListener("pointercancel", finish);
    return () => {
      container.removeEventListener("pointerdown", onDown);
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerup", finish);
      container.removeEventListener("pointercancel", finish);
      drawingRef.current = false;
      pointerIdRef.current = null;
      pointsRef.current = [];
      lineRef.current?.setMap(null);
      lineRef.current = null;
    };
  }, [map, active]);
}