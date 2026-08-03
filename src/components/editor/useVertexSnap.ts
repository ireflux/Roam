"use client";

import { useEffect, useRef } from "react";
import type { MapMouseEvent, GeoJSONSource } from "maplibre-gl";
import type { MaplibreMap } from "@/lib/mapTypes";
import type { Mode, Position, TripData, TripSegment } from "@/lib/types";
import { simplifyVertices } from "@/lib/trip/ops";

const MAX_VERTICES = 24;

/**
 * 吸附编辑：选中段的折线顶点可拖拽，拖动时把顶点吸附到最近道路。
 * commit=true 表示一次拖拽结束，store 将段标记为 snapped 并保存。
 */
export function useVertexSnap(
  map: MaplibreMap | null,
  active: boolean,
  data: TripData,
  selectedSegId: string | null,
  onMove: (segId: string, vertexIndex: number, position: Position, commit: boolean) => void,
) {
  const segRef = useRef<TripSegment | null>(null);
  const dragRef = useRef<{ vertexIndex: number } | null>(null);
  const verticesListRef = useRef<Position[]>([]);
  const lastPosRef = useRef<Position>([0, 0]);
  const pendingModeRef = useRef<Mode | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMoveRef = useRef(onMove);

  useEffect(() => {
    onMoveRef.current = onMove;
  });

  const activeSeg = active
    ? (data.segments.find((s) => s.id === selectedSegId && s.kind !== "auto") ?? null)
    : null;

  // 顶点渲染
  useEffect(() => {
    if (!map) return;
    if (!map.getSource("snap-vertices")) {
      map.addSource("snap-vertices", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    if (!map.getLayer("snap-vertex-pt")) {
      map.addLayer({
        id: "snap-vertex-pt",
        type: "circle",
        source: "snap-vertices",
        paint: {
          "circle-radius": 5,
          "circle-color": "#7c3aed",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    }
    segRef.current = activeSeg;
    dragRef.current = null;
    const source = map.getSource("snap-vertices") as GeoJSONSource | undefined;
    if (!activeSeg) {
      verticesListRef.current = [];
      source?.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const coords = activeSeg.geometry.coordinates;
    if (coords.length < 3) {
      verticesListRef.current = [];
      source?.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const inner = simplifyVertices(coords, MAX_VERTICES).slice(1, -1);
    verticesListRef.current = inner;
    const features = inner.map((c) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Point" as const, coordinates: c },
    }));
    source?.setData({ type: "FeatureCollection", features });
  }, [map, active, activeSeg]);

  // 拖拽交互
  useEffect(() => {
    if (!map || !active) return;

    const onDown = (e: MapMouseEvent) => {
      if (e.originalEvent.button !== 0) return;
      const hits = map.queryRenderedFeatures(e.point, { layers: ["snap-vertex-pt"] });
      if (hits.length === 0) return;
      const g = hits[0].geometry as { type: "Point"; coordinates: Position };
      if (g.type !== "Point") return;
      const coords = g.coordinates;
      const list = verticesListRef.current;
      const idx = list.findIndex(
        (v) =>
          Math.abs(v[0] - coords[0]) < 1e-6 && Math.abs(v[1] - coords[1]) < 1e-6,
      );
      if (idx < 0) return;
      dragRef.current = { vertexIndex: idx + 1 };
      lastPosRef.current = coords;
      e.originalEvent.preventDefault();
    };

    const onMove = (e: MapMouseEvent) => {
      const drag = dragRef.current;
      const seg = segRef.current;
      if (!drag || !seg) return;
      const vertexIndex = drag.vertexIndex;
      const raw: Position = [e.lngLat.lng, e.lngLat.lat];
      lastPosRef.current = raw;
      onMoveRef.current(seg.id, vertexIndex, raw, false);
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      pendingModeRef.current = seg.mode;
      pendingTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            const res = await fetch("/api/snap", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mode: seg.mode, point: raw }),
            });
            const json = (await res.json()) as { location: Position };
            if (json.location && dragRef.current?.vertexIndex === vertexIndex) {
              lastPosRef.current = json.location;
              onMoveRef.current(seg.id, vertexIndex, json.location, false);
            }
          } catch {
            // 吸附失败则保留当前拖动位置
          }
        })();
      }, 150);
    };

    const onUp = () => {
      const drag = dragRef.current;
      const seg = segRef.current;
      if (!drag || !seg) return;
      dragRef.current = null;
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      pendingModeRef.current = null;
      onMoveRef.current(seg.id, drag.vertexIndex, lastPosRef.current, true);
    };

    map.on("mousedown", onDown);
    map.on("mousemove", onMove);
    const onWindowUp = () => onUp();
    window.addEventListener("mouseup", onWindowUp);
    return () => {
      map.off("mousedown", onDown);
      map.off("mousemove", onMove);
      window.removeEventListener("mouseup", onWindowUp);
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    };
  }, [map, active]);


}
