"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { Trip, TripData, Position, TripSegment, Mode } from "@/lib/types";
import { MODE_ICON, MODE_LABEL } from "@/lib/types";
import { formatDistance, formatDuration } from "@/lib/trip/geo";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const COLOR: Record<Mode, string> = { driving: "#2563eb", walking: "#059669", cycling: "#ea580c" };

export default function ShareView({ trip }: { trip: Trip }) {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [playing, setPlaying] = useState(false);
  const calc = useMemo(() => summarize(trip.data), [trip.data]);

  return (
    <main className="flex h-dvh w-full overflow-hidden">
      <section className="relative flex-1">
        <MapView className="absolute inset-0" onLoad={(m) => setMap(m)} />
        {map && <ShareLayers map={map} data={trip.data} />}
        {map && <PlayLine map={map} data={trip.data} playing={playing} />}
        <button
          onClick={() => setPlaying((p) => !p)}
          className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-white px-5 py-2 text-sm font-medium shadow-lg hover:scale-105 dark:bg-zinc-900"
        >
          {playing ? "⏸ 暂停" : "▶ 播放全程"}
        </button>
      </section>

      <aside className="flex w-full max-w-md flex-col overflow-hidden border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <header className="border-b border-zinc-200 p-5 dark:border-zinc-800">
          <h1 className="text-xl font-bold">{trip.title || "未命名路线"}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {trip.data.days.length} 天 · {trip.data.stops.length} 个地点 ·{" "}
            {formatDistance(calc.totalM)}
            {calc.totalMin > 0 && ` · 约 ${formatDuration(calc.totalMin)}`}
          </p>
        </header>
        <div className="flex-1 overflow-y-auto">
          {trip.data.days.map((day, di) => {
            const dayStops = trip.data.stops
              .filter((s) => s.dayId === day.id)
              .sort((a, b) => a.order - b.order);
            return (
              <section key={day.id} className="border-b border-zinc-100 p-5 last:border-0 dark:border-zinc-900">
                <h2 className="mb-3 text-sm font-semibold text-zinc-500">第 {di + 1} 天</h2>
                <ol className="space-y-2">
                  {dayStops.map((stop, i) => {
                    const next = dayStops[i + 1];
                    const seg = next
                      ? trip.data.segments.find((s) => s.fromStop === stop.id && s.toStop === next.id)
                      : undefined;
                    return (
                      <StopCard
                        key={stop.id}
                        stop={stop}
                        index={i + 1}
                        seg={seg}
                        onFocus={() => {
                          if (!map) return;
                          map.easeTo({ center: [stop.lng, stop.lat], zoom: Math.max(map.getZoom(), 13), duration: 600 });
                        }}
                      />
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      </aside>
    </main>
  );
}

function StopCard({
  stop,
  index,
  seg,
  onFocus,
}: {
  stop: { name: string; note?: string };
  index: number;
  seg?: TripSegment;
  onFocus: () => void;
}) {
  return (
    <li className="cursor-pointer rounded-xl border border-zinc-200 px-4 py-3 transition hover:border-emerald-400 dark:border-zinc-800" onClick={onFocus}>
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{stop.name || "未命名地点"}</div>
          {stop.note && <div className="mt-0.5 truncate text-xs text-zinc-400">{stop.note}</div>}
        </div>
        {seg && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-400" title={MODE_LABEL[seg.mode]}>
            {MODE_ICON[seg.mode]}
            {seg.distanceM ? formatDistance(seg.distanceM) : ""}
            {seg.durationMin ? ` · ${formatDuration(seg.durationMin)}` : ""}
          </span>
        )}
      </div>
    </li>
  );
}

function summarize(data: TripData) {
  let totalM = 0;
  let totalMin = 0;
  for (const seg of data.segments) {
    totalM += seg.distanceM ?? 0;
    totalMin += seg.durationMin ?? 0;
  }
  return { totalM, totalMin };
}

function ShareLayers({ map, data }: { map: MapLibreMap; data: TripData }) {
  useEffect(() => {
    if (!map.getSource("segments")) {
      map.addSource("segments", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "segments-line",
        type: "line",
        source: "segments",
        paint: {
          "line-color": ["match", ["get", "mode"], "driving", COLOR.driving, "walking", COLOR.walking, "cycling", COLOR.cycling, COLOR.driving],
          "line-width": 4,
          "line-opacity": 0.9,
        },
      });
    }
    if (!map.getSource("stops")) {
      map.addSource("stops", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "stops-dot",
        type: "circle",
        source: "stops",
        paint: { "circle-radius": 8, "circle-color": "#ffffff", "circle-stroke-width": 2.5, "circle-stroke-color": "#059669" },
      });
      map.addLayer({
        id: "stops-label",
        type: "symbol",
        source: "stops",
        layout: { "text-field": ["get", "label"], "text-size": 11, "text-font": ["Noto Sans Regular"], "text-allow-overlap": true },
        paint: { "text-color": "#065f46" },
      });
    }
    (map.getSource("segments") as GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: data.segments.map((s) => ({ type: "Feature", properties: { mode: s.mode }, geometry: s.geometry })),
    });
    (map.getSource("stops") as GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: data.stops.map((s) => {
        const dayStops = data.stops.filter((x) => x.dayId === s.dayId).sort((a, b) => a.order - b.order);
        return {
          type: "Feature",
          properties: { label: String(dayStops.findIndex((x) => x.id === s.id) + 1) },
          geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        };
      }),
    });
    if (data.stops.length > 0 || data.segments.length > 0) {
      map.fitBounds(boundsOf(data), { padding: 48, maxZoom: 16, duration: 0 });
    }
  }, [map, data]);
  return null;
}

function boundsOf(data: TripData): [[number, number], [number, number]] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const push = (p: Position) => {
    minLng = Math.min(minLng, p[0]);
    maxLng = Math.max(maxLng, p[0]);
    minLat = Math.min(minLat, p[1]);
    maxLat = Math.max(maxLat, p[1]);
  };
  for (const s of data.stops) push([s.lng, s.lat]);
  for (const seg of data.segments) for (const c of seg.geometry.coordinates) push(c);
  return [[minLng, minLat], [maxLng, maxLat]];
}

function PlayLine({ map, data, playing }: { map: MapLibreMap; data: TripData; playing: boolean }) {
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const master = buildMasterLine(data);
    if (master.length < 2 || !playing) return;
    if (!map.getSource("play-line")) {
      map.addSource("play-line", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "play-line",
        type: "line",
        source: "play-line",
        paint: { "line-color": "#f59e0b", "line-width": 5, "line-opacity": 0.95 },
      });
      map.addLayer({
        id: "play-dot",
        type: "circle",
        source: "play-line",
        paint: { "circle-radius": 6, "circle-color": "#eab308", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" },
      });
    }
    const DURATION = 8000;
    const start = performance.now();
    const draw = () => {
      const t = Math.min(1, (performance.now() - start) / DURATION);
      const count = Math.max(2, Math.floor(master.length * t));
      const pt = pointAt(master, t);
      const src = map.getSource("play-line") as GeoJSONSource;
      src?.setData({
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: master.slice(0, count) } },
          { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: pt } },
        ],
      });
      map.easeTo({ center: pt, duration: 300 });
      if (t < 1) rafRef.current = requestAnimationFrame(draw);
      else {
        const src2 = map.getSource("play-line") as GeoJSONSource;
        src2?.setData({
          type: "FeatureCollection",
          features: [
            { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: master } },
            { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: master[master.length - 1] } },
          ],
        });
      }
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [map, data, playing]);

  return null;
}

function buildMasterLine(data: TripData): Position[] {
  const stopsById = new Map(data.stops.map((s) => [s.id, s]));
  const sorted = [...data.segments].sort((a, b) => {
    const oa = stopsById.get(a.fromStop)?.order ?? 0;
    const ob = stopsById.get(b.fromStop)?.order ?? 0;
    return oa - ob;
  });
  const out: Position[] = [];
  for (const seg of sorted) {
    if (out.length === 0) out.push(...seg.geometry.coordinates);
    else out.push(...seg.geometry.coordinates.slice(1));
  }
  return out;
}

function pointAt(coords: Position[], p: number): Position {
  if (coords.length === 0) return [104, 35];
  if (p <= 0) return coords[0];
  if (p >= 1) return coords[coords.length - 1];
  const target = p * (coords.length - 1);
  const i = Math.floor(target);
  const frac = target - i;
  const a = coords[i];
  const b = coords[Math.min(i + 1, coords.length - 1)];
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
}