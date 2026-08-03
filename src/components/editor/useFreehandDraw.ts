"use client";

import { useEffect, useRef } from "react";
import type { MapMouseEvent, GeoJSONSource } from "maplibre-gl";
import type { MaplibreMap } from "@/lib/mapTypes";
import type { Position } from "@/lib/types";

/**
 * 自由绘制：按住拖动画线，松开时回调完整的折线点集。
 */
export function useFreehandDraw(
  map: MaplibreMap | null,
  active: boolean,
  onCommit: (points: Position[]) => void,
) {
  const drawingRef = useRef(false);
  const pointsRef = useRef<Position[]>([]);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  });

  useEffect(() => {
    if (!map) return;
    if (!map.getSource("draft")) {
      map.addSource("draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    if (!map.getLayer("draft-line")) {
      map.addLayer({
        id: "draft-line",
        type: "line",
        source: "draft",
        paint: { "line-color": "#0d9488", "line-width": 5, "line-dasharray": [1, 0.5] },
      });
    }
  }, [map]);

  useEffect(() => {
    if (!map) return;
    if (!active) {
      drawingRef.current = false;
      pointsRef.current = [];
      (map.getSource("draft") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: [],
      });
      return;
    }

    map.dragPan.disable();

    const setDraft = (features: unknown[]) => {
      (map.getSource("draft") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: features as never[],
      });
    };

    const onDown = (e: MapMouseEvent) => {
      if (e.originalEvent.button !== 0) return;
      if (e.originalEvent.shiftKey || e.originalEvent.altKey) return;
      drawingRef.current = true;
      pointsRef.current = [[e.lngLat.lng, e.lngLat.lat]];
      setDraft([geometryFrom(pointsRef.current)]);
    };
    const onMove = (e: MapMouseEvent) => {
      if (!drawingRef.current) return;
      pointsRef.current.push([e.lngLat.lng, e.lngLat.lat]);
      setDraft([geometryFrom(pointsRef.current)]);
    };
    const onUp = () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      const points = pointsRef.current;
      pointsRef.current = [];
      setDraft([]);
      if (points.length >= 2) onCommitRef.current(points);
    };

    map.on("mousedown", onDown);
    map.on("mousemove", onMove);
    const onWindowUp = () => onUp();
    window.addEventListener("mouseup", onWindowUp);
    return () => {
      map.dragPan.enable();
      map.off("mousedown", onDown);
      map.off("mousemove", onMove);
      window.removeEventListener("mouseup", onWindowUp);
    };
  }, [map, active]);
}

function geometryFrom(points: Position[]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: points },
  };
}