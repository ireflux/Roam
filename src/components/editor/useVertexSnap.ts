"use client";

import { useEffect, useRef } from "react";
import type { AmapMap, AmapOverlay } from "@/lib/mapTypes";
import type { Position, TripData, TripSegment } from "@/lib/types";
import { simplifyVertices } from "@/lib/trip/ops";

const MAX_VERTICES = 24;

/** Edit freehand vertices. AMap's trace-correction API needs a full GPS track, so one-off vertices remain user-selected. */
export function useVertexSnap(map: AmapMap | null, active: boolean, data: TripData, selectedSegId: string | null, onMove: (segId: string, vertexIndex: number, position: Position, commit: boolean) => void) {
  const overlaysRef = useRef<AmapOverlay[]>([]);
  const activeSeg: TripSegment | null = active ? data.segments.find((segment) => segment.id === selectedSegId && segment.kind !== "auto") ?? null : null;

  useEffect(() => {
    if (!map || !window.AMap) return;
    map.remove(overlaysRef.current);
    if (!activeSeg || activeSeg.geometry.coordinates.length < 3) return;
    const vertices = simplifyVertices(activeSeg.geometry.coordinates, MAX_VERTICES).slice(1, -1);
    const overlays = vertices.map((position, index) => {
      const marker = new window.AMap!.Marker({ position, draggable: true, content: '<span style="display:block;width:12px;height:12px;border:2px solid white;border-radius:50%;background:#7c3aed"></span>', anchor: "center" });
      marker.on("dragging", (event) => onMove(activeSeg.id, index + 1, [event.lnglat.getLng(), event.lnglat.getLat()], false));
      marker.on("dragend", (event) => onMove(activeSeg.id, index + 1, [event.lnglat.getLng(), event.lnglat.getLat()], true));
      return marker;
    });
    map.add(overlays);
    overlaysRef.current = overlays;
    return () => map.remove(overlays);
  }, [map, activeSeg, onMove]);
}
