"use client";

import { useEffect, useRef } from "react";
import type { AmapMap, AmapOverlay } from "@/lib/mapTypes";
import type { TripData } from "@/lib/types";
import { useTripStore } from "@/lib/useTripStore";

const EMPTY_DATA: TripData = { days: [], stops: [], segments: [] };
const COLORS = { driving: "#2563eb", walking: "#059669", cycling: "#ea580c", freehand: "#71717a", snapped: "#7c3aed" };

function stopContent(label: string, selected: boolean) {
  return `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;border:2px solid ${selected ? "#0f766e" : "#059669"};background:${selected ? "#0d9488" : "#fff"};color:${selected ? "#fff" : "#065f46"};font:600 11px Arial">${label}</span>`;
}

export default function MapLayers({ map }: { map: AmapMap | null }) {
  const trip = useTripStore((s) => s.trip);
  const tool = useTripStore((s) => s.tool);
  const selectedStopId = useTripStore((s) => s.selectedStopId);
  const selectedSegId = useTripStore((s) => s.selectedSegId);
  const overlaysRef = useRef<AmapOverlay[]>([]);
  const data = trip?.data ?? EMPTY_DATA;

  useEffect(() => {
    if (!map || !window.AMap) return;
    map.remove(overlaysRef.current);
    const overlays: AmapOverlay[] = [];
    for (const segment of data.segments) {
      const color = segment.kind === "snapped" ? COLORS.snapped : segment.kind === "freehand" ? COLORS.freehand : COLORS[segment.mode];
      const line = new window.AMap.Polyline({ path: segment.geometry.coordinates, strokeColor: color, strokeWeight: segment.id === selectedSegId ? 6 : 4, strokeOpacity: segment.id === selectedSegId ? 1 : 0.85, lineJoin: "round" });
      line.on("click", () => useTripStore.getState().selectSeg(segment.id));
      overlays.push(line);
    }
    for (const stop of data.stops) {
      const sameDay = data.stops.filter((candidate) => candidate.dayId === stop.dayId).sort((a, b) => a.order - b.order);
      const label = String(sameDay.findIndex((candidate) => candidate.id === stop.id) + 1);
      const marker = new window.AMap.Marker({ position: [stop.lng, stop.lat], content: stopContent(label, stop.id === selectedStopId), anchor: "center" });
      marker.on("click", () => useTripStore.getState().selectStop(stop.id));
      overlays.push(marker);
    }
    map.add(overlays);
    overlaysRef.current = overlays;
    return () => map.remove(overlays);
  }, [map, data, selectedSegId, selectedStopId]);

  useEffect(() => {
    if (!map) return;
    const onClick = (event: { lnglat: { getLng(): number; getLat(): number } }) => {
      const store = useTripStore.getState();
      if (store.tool === "add") {
        store.addStopAt({ name: "", lng: event.lnglat.getLng(), lat: event.lnglat.getLat(), mode: store.currentMode });
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
  }, [map, tool]);

  return null;
}
