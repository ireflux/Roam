"use client";

import { useEffect } from "react";
import type { MapMouseEvent, GeoJSONSource } from "maplibre-gl";
import type { MaplibreMap } from "@/lib/mapTypes";
import type { TripData } from "@/lib/types";
import { useTripStore } from "@/lib/useTripStore";

const SEG_COLORS = {
  auto: { driving: "#2563eb", walking: "#059669", cycling: "#ea580c" },
  freehand: "#71717a",
  snapped: "#7c3aed",
} as const;

const EMPTY_DATA: TripData = { days: [], stops: [], segments: [] };

export default function MapLayers({ map }: { map: MaplibreMap | null }) {
  const trip = useTripStore((s) => s.trip);
  const tool = useTripStore((s) => s.tool);
  const selectedStopId = useTripStore((s) => s.selectedStopId);
  const selectedSegId = useTripStore((s) => s.selectedSegId);
  const data: TripData = trip?.data ?? EMPTY_DATA;

  useEffect(() => {
    if (!map) return;
    if (!map.getSource("segments")) {
      map.addSource("segments", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("stops", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    if (!map.getLayer("segments-line")) {
      map.addLayer({
        id: "segments-line",
        type: "line",
        source: "segments",
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "kind"], "auto"],
            ["match", ["get", "mode"], "driving", SEG_COLORS.auto.driving, "walking", SEG_COLORS.auto.walking, "cycling", SEG_COLORS.auto.cycling, SEG_COLORS.auto.driving],
            ["==", ["get", "kind"], "snapped"], SEG_COLORS.snapped,
            SEG_COLORS.freehand,
          ],
          "line-width": 4,
          "line-opacity": ["case", ["==", ["get", "selected"], true], 1, 0.85],
        },
      });
      map.addLayer({
        id: "segments-line-selected",
        type: "line",
        source: "segments",
        filter: ["==", ["get", "selected"], true],
        paint: { "line-color": "#18181b", "line-width": 8, "line-opacity": 0.25 },
      });
      map.addLayer({
        id: "stops-dot",
        type: "circle",
        source: "stops",
        paint: {
          "circle-radius": 9,
          "circle-color": ["case", ["==", ["get", "selected"], true], "#0d9488", "#ffffff"],
          "circle-stroke-width": 2.5,
          "circle-stroke-color": ["case", ["==", ["get", "selected"], true], "#0f766e", "#059669"],
        },
      });
      map.addLayer({
        id: "stops-label",
        type: "symbol",
        source: "stops",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-font": ["Noto Sans Regular"],
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#065f46" },
      });
    }

    const segmentFeatures = data.segments.map((seg) => ({
      type: "Feature" as const,
      properties: {
        id: seg.id,
        kind: seg.kind,
        mode: seg.mode,
        selected: seg.id === selectedSegId,
      },
      geometry: seg.geometry,
    }));
    const stopFeatures = data.stops.map((stop) => {
      const dayStops = data.stops.filter((s) => s.dayId === stop.dayId).sort((a, b) => a.order - b.order);
      const idx = dayStops.findIndex((s) => s.id === stop.id);
      return {
        type: "Feature" as const,
        properties: { id: stop.id, label: String(idx + 1), selected: stop.id === selectedStopId },
        geometry: { type: "Point" as const, coordinates: [stop.lng, stop.lat] },
      };
    });

    const segSource = map.getSource("segments") as GeoJSONSource | undefined;
    const stopSource = map.getSource("stops") as GeoJSONSource | undefined;
    segSource?.setData({ type: "FeatureCollection", features: segmentFeatures });
    stopSource?.setData({ type: "FeatureCollection", features: stopFeatures });

    map.setLayoutProperty("stops-label", "text-field", ["get", "label"]);
  }, [map, data, selectedSegId, selectedStopId]);

  useEffect(() => {
    if (!map) return;
    const onClick = (e: MapMouseEvent) => {
      const store = useTripStore.getState();
      if (store.tool === "add") {
        store.addStopAt({ name: "", lat: e.lngLat.lat, lng: e.lngLat.lng, mode: store.currentMode });
        return;
      }
      const segHit = map.queryRenderedFeatures(e.point, { layers: ["segments-line"] });
      const stopHit = map.queryRenderedFeatures(e.point, { layers: ["stops-dot"] });
      if (stopHit.length > 0) {
        store.selectStop((stopHit[0].properties?.id as string) ?? null);
      } else if (segHit.length > 0) {
        store.selectSeg((segHit[0].properties?.id as string) ?? null);
      } else {
        store.selectStop(null);
        store.selectSeg(null);
      }
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    map.getCanvas().style.cursor = tool === "add" ? "crosshair" : tool === "draw" ? "copy" : "";
  }, [map, tool]);

  return null;
}
