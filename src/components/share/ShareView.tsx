"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { AmapMap, AmapOverlay } from "@/lib/mapTypes";
import type { Mode, PublicTrip, TripData } from "@/lib/types";
import { formatDistance, formatDuration } from "@/lib/trip/geo";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
const COLOR: Record<Mode, string> = { driving: "#2563eb", walking: "#059669", cycling: "#ea580c" };

export default function ShareView({ trip }: { trip: PublicTrip }) {
  const [map, setMap] = useState<AmapMap | null>(null);
  const [playing, setPlaying] = useState(false);
  const calc = useMemo(() => summarize(trip.data), [trip.data]);
  return <main className="flex h-dvh w-full overflow-hidden"><section className="relative flex-1"><MapView className="absolute inset-0" onLoad={setMap} />{map && <ShareLayers map={map} data={trip.data} playing={playing} />}<button onClick={() => setPlaying((value) => !value)} className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-white px-5 py-2 text-sm font-medium shadow-lg hover:scale-105">{playing ? "⏸ 暂停" : "▶ 播放全程"}</button></section><aside className="flex w-full max-w-md flex-col overflow-hidden border-l border-zinc-200 bg-white"><header className="border-b border-zinc-200 p-5"><h1 className="text-xl font-bold">{trip.title || "未命名路线"}</h1><p className="mt-1 text-sm text-zinc-500">{trip.data.days.length} 天 · {trip.data.stops.length} 个地点 · {formatDistance(calc.totalM)}{calc.totalMin > 0 && ` · 约 ${formatDuration(calc.totalMin)}`}</p></header><div className="flex-1 overflow-y-auto">{trip.data.days.map((day, dayIndex) => <section key={day.id} className="border-b border-zinc-100 p-5"><h2 className="mb-3 text-sm font-semibold text-zinc-500">第 {dayIndex + 1} 天</h2><ol className="space-y-2">{trip.data.stops.filter((stop) => stop.dayId === day.id).sort((a, b) => a.order - b.order).map((stop, index) => <li key={stop.id} className="rounded-xl border border-zinc-200 px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">{index + 1}</span><div className="min-w-0 flex-1"><div className="truncate font-medium">{stop.name || "未命名地点"}</div>{stop.note && <div className="mt-0.5 truncate text-xs text-zinc-400">{stop.note}</div>}</div></div></li>)}</ol></section>)}</div></aside></main>;
}

function ShareLayers({ map, data, playing }: { map: AmapMap; data: TripData; playing: boolean }) {
  const overlaysRef = useRef<AmapOverlay[]>([]);
  const playRef = useRef<AmapOverlay | null>(null);
  useEffect(() => {
    if (!window.AMap) return;
    map.remove(overlaysRef.current);
    const overlays: AmapOverlay[] = [
      ...data.segments.map((segment) => new window.AMap!.Polyline({ path: segment.geometry.coordinates, strokeColor: COLOR[segment.mode], strokeWeight: 4, strokeOpacity: 0.9 })),
      ...data.stops.map((stop) => new window.AMap!.Marker({ position: [stop.lng, stop.lat], content: '<span style="display:block;width:16px;height:16px;border:2px solid #059669;border-radius:50%;background:white"></span>', anchor: "center" })),
    ];
    map.add(overlays); overlaysRef.current = overlays;
    if (overlays.length) map.setFitView(overlays, true, [48, 48, 48, 380], 16);
    return () => map.remove(overlays);
  }, [map, data]);
  useEffect(() => {
    const points = data.segments.flatMap((segment) => segment.geometry.coordinates);
    if (!playing || points.length < 2 || !window.AMap) { playRef.current?.setMap(null); playRef.current = null; return; }
    const marker = new window.AMap.Marker({ position: points[0], content: '<span style="display:block;width:14px;height:14px;border:2px solid white;border-radius:50%;background:#eab308"></span>', anchor: "center" });
    map.add(marker); playRef.current = marker;
    const start = performance.now(); let frame = 0;
    const animate = (now: number) => { const t = Math.min(1, (now - start) / 8000); const point = points[Math.min(points.length - 1, Math.floor(t * (points.length - 1)))]; marker.setPosition?.(point); map.setCenter(point); if (t < 1) frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); marker.setMap(null); };
  }, [map, data, playing]);
  return null;
}

function summarize(data: TripData) { return data.segments.reduce((total, segment) => ({ totalM: total.totalM + (segment.distanceM ?? 0), totalMin: total.totalMin + (segment.durationMin ?? 0) }), { totalM: 0, totalMin: 0 }); }
