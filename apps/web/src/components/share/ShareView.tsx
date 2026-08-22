"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import QRCode from "qrcode";
import { CalendarDays, Check, ChevronRight, Navigation, Play, Pause, QrCode, X } from "lucide-react";
import type { AmapMap, AmapOverlay } from "@/lib/mapTypes";
import type { Mode, PublicTrip, TripData, TripStop } from "@roam/core";
import { MODE_LABEL } from "@roam/core";
import { formatDistance } from "@roam/core";
import { summarizeDay } from "@roam/core";
import { useDayWeather, weatherPoints, WeatherBadge, type DayWeatherInfo } from "@/components/weather/useDayWeather";
import { useAuthState } from "@/lib/auth-client";
import { useDismissOnEscape } from "@/hooks/useDismissOnEscape";
import SaveAction from "@/components/share/SaveAction";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const GREEN = "#0E7A5C";
const GOLD = "#C9A86A";
const INK = "#1D211D";
const AMBER = "#B45309";
const GREEN_LIGHT = "#5B9E8A";

const NAV_MODE: Record<Mode, string> = { driving: "car", walking: "walk", cycling: "ride", transit: "bus" };

export default function ShareView({ trip, nickname, savedTripId }: { trip: PublicTrip; nickname?: string | null; savedTripId?: string | null }) {
  const [map, setMap] = useState<AmapMap | null>(null);
  const [playing, setPlaying] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const auth = useAuthState();

  const dayStops = useMemo(() => {
    const mapByDay = new Map<string, TripStop[]>();
    for (const day of trip.data.days) mapByDay.set(day.id, []);
    for (const stop of trip.data.stops) mapByDay.get(stop.dayId)?.push(stop);
    for (const list of mapByDay.values()) list.sort((a, b) => a.order - b.order);
    return mapByDay;
  }, [trip.data]);

  const totals = useMemo(
    () => trip.data.days.reduce((acc, day) => {
      const s = summarizeDay(trip.data, day.id);
      return { stops: acc.stops + s.stops, m: acc.m + s.distanceM, min: acc.min + s.durationMin };
    }, { stops: 0, m: 0, min: 0 }),
    [trip.data],
  );

  const dayWeather = useDayWeather(weatherPoints(trip.data));
  const firstDayId = trip.data.days[0]?.id;

  useEffect(() => {
    if (!qrOpen) return;
    let live = true;
    const url = window.location.href.split("#")[0];
    QRCode.toDataURL(url, { width: 216, margin: 1, color: { dark: INK, light: "#FFFFFF" } })
      .then((dataUrl) => { if (live) setQrData(dataUrl); })
      .catch(() => setQrData(null));
    return () => { live = false; };
  }, [qrOpen]);

  const togglePlay = () => {
    setPlaying((value) => {
      if (!value) coverRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return !value;
    });
  };

  const tripUrl = typeof window === "undefined" ? "" : window.location.href.split("#")[0];
  const [copied, setCopied] = useState(false);
  useDismissOnEscape(qrOpen, () => setQrOpen(false));
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(tripUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用时静默
    }
  };

  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-paper text-ink">
      <header className="mx-auto flex w-full max-w-3xl items-baseline justify-between px-4 pb-2 pt-5 sm:px-6">
        <span className="font-serif text-lg font-bold tracking-[0.28em] text-brand">ROAM</span>
        <span className="text-xs text-muted">
          路线 · 由 {nickname || "旅行者"} 分享
        </span>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-4 sm:px-6 sm:pb-24">
        {/* 封面明信片：地图内嵌 + 印章 + 数据条 */}
        <div
          ref={coverRef}
          className="anim-scale-in relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-line shadow-float-lg sm:aspect-[16/9] sm:rounded-3xl"
        >
          <MapView className="absolute inset-0" onLoad={setMap} />
          {map && <ShareLayers map={map} data={trip.data} playing={playing} />}
          {/* 印章 */}
          <div
            className="absolute right-3 top-3 flex h-14 w-14 rotate-12 items-center justify-center rounded-full border-2 font-serif text-2xl text-amber shadow-sm backdrop-blur-[2px]"
            style={{ borderColor: GOLD, background: "rgba(255,255,255,0.6)" }}
            aria-hidden
          >
            游
          </div>
          <div className="absolute inset-x-3 bottom-3 rounded-xl border border-white/60 bg-white/90 p-4 shadow-card backdrop-blur-md sm:inset-x-4 sm:bottom-4">
            <h1 className="font-serif text-xl font-bold leading-snug sm:text-2xl">
              {trip.title || "未命名路线"}
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              {nickname ? `由 ${nickname} 精心编排` : "一段精心编排的旅程"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span><b className="font-semibold text-brand">{trip.data.days.length}</b> 天</span>
              <span><b className="font-semibold text-brand">{totals.stops}</b> 站</span>
              <span><b className="font-semibold text-brand">{formatDistance(totals.m)}</b></span>
              <span className="ml-auto"><WeatherBadge info={dayWeather[firstDayId ?? ""]} /></span>
            </div>
          </div>
        </div>

        {/* 日期时间线 */}
        {trip.data.days.map((day, dayIndex) => {
          const stops = dayStops.get(day.id) ?? [];
          const stopIds = new Set(stops.map((s) => s.id));
          const modes = [...new Set(trip.data.segments.filter((seg) => stopIds.has(seg.fromStop) && stopIds.has(seg.toStop)).map((seg) => seg.mode))];
          const daySummary = summarizeDay(trip.data, day.id);
          return (
            <section key={day.id} className="mt-10">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="font-serif text-5xl font-bold leading-none text-brand">
                    {String(dayIndex + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-lg font-semibold">{day.name ?? `第 ${dayIndex + 1} 天`}</h2>
                </div>
                <DayMeta day={day} modes={modes} weather={dayWeather[day.id]} stopCount={stops.length} minutes={daySummary.durationMin} />
              </div>
              {stops.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
                  当日暂无行程，可自由漫步
                </p>
              ) : (
                <ol className="relative mt-6">
                  <div
                    className="absolute bottom-3 left-[13px] top-3 w-0.5 rounded-full"
                    style={{ background: `linear-gradient(to bottom, ${GREEN} 0%, ${GREEN} 60%, ${GOLD} 100%)` }}
                    aria-hidden
                  />
                  {stops.map((stop, index) => {
                    const isLast = index === stops.length - 1;
                    const intoMode = trip.data.segments.find((seg) => seg.toStop === stop.id)?.mode;
                    return (
                      <li key={stop.id} className="relative pb-5 pl-10 last:pb-0">
                        <span
                          className={`absolute left-0 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white shadow-sm ${
                            isLast ? "bg-gold" : "bg-brand"
                          }`}
                          aria-hidden
                        >
                          {index + 1}
                        </span>
                        <div className="group flex items-center gap-3 rounded-2xl border border-line bg-surface/80 px-4 py-3 shadow-sm backdrop-blur-sm transition-all hover:border-brand/30 hover:shadow-card">
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{stop.name || "未命名地点"}</div>
                            {stop.note && <div className="mt-0.5 truncate text-xs text-muted">{stop.note}</div>}
                          </div>
                          <a
                            href={navLink(stop, intoMode)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="发起导航"
                            aria-label={`导航到 ${stop.name || "未命名地点"}`}
                            className="hidden shrink-0 items-center justify-center rounded-full p-2 text-brand opacity-0 transition-interact hover:bg-brand-soft focus-visible:opacity-100 group-hover:opacity-100 sm:flex"
                          >
                            <Navigation size={17} />
                          </a>
                        </div>
                      </li>
                    );
                  })}
                  <span className="absolute -bottom-1 left-[9px] h-2.5 w-2.5 rounded-full border-2 border-gold bg-gold/20" aria-hidden />
                </ol>
              )}
            </section>
          );
        })}
      </div>

      {/* 底部操作条 */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-4 py-3 sm:px-6">
          <button
            onClick={togglePlay}
            className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-brand text-sm font-semibold text-white shadow-md transition-interact hover:brightness-110 active:scale-[0.98]"
          >
            {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
            {playing ? "暂停" : "播放全程"}
          </button>
          <SaveAction trip={trip} auth={auth} savedTripId={savedTripId ?? null} />
          <button
            onClick={() => setQrOpen(true)}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm transition-interact hover:border-brand/40 hover:text-brand active:scale-95"
            title="在手机上打开"
            aria-label="二维码"
          >
            <QrCode size={18} />
          </button>
        </div>
        <div className="mx-auto w-full max-w-3xl px-4 pb-3 sm:hidden sm:px-6">
          <a
            href={nextStopNavLink(trip.data)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-brand/50 bg-surface text-sm font-semibold text-brand transition-interact hover:bg-brand-soft active:scale-[0.98]"
          >
            <Navigation size={16} aria-hidden />
            导航到下一站
          </a>
        </div>
      </div>

      {/* 二维码弹窗 */}
      {qrOpen && (
        <div className="anim-fade-in fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="二维码">
          <button className="absolute inset-0 cursor-pointer bg-ink/50 backdrop-blur-sm" aria-label="关闭" onClick={() => setQrOpen(false)} />
          <div className="anim-scale-in relative w-80 rounded-3xl border border-line bg-surface p-6 text-center shadow-float-lg">
            <button
              className="absolute right-3 top-3 cursor-pointer rounded-full p-1.5 text-faint transition-interact hover:bg-surface-soft hover:text-ink"
              aria-label="关闭"
              onClick={() => setQrOpen(false)}
            >
              <X size={16} />
            </button>
            <h3 className="font-serif text-base font-semibold">在手机上打开路线</h3>
            <div className="mt-4 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- 客户端生成的 data URL 二维码，无需 next/image 优化 */}
              {qrData ? <img src={qrData} alt="路线二维码" width={216} height={216} className="rounded-xl border border-line" /> : <div className="flex h-[216px] w-[216px] items-center justify-center rounded-xl bg-surface-soft text-sm text-faint">生成中…</div>}
            </div>
            <p className="mt-3 break-all text-xs text-muted">{tripUrl || ""}</p>
            <button
              onClick={copyLink}
              className="mt-3 flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-brand text-sm font-semibold text-white transition-interact hover:brightness-110 active:scale-[0.98]"
            >
              {copied ? <Check size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
              {copied ? "已复制" : "复制链接"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/* ------------------------------- 天气/日期 meta ------------------------------- */

function DayMeta({ day, modes, weather, stopCount, minutes }: {
  day: { date?: string; name?: string };
  modes: Mode[];
  weather: DayWeatherInfo | null | undefined;
  stopCount: number;
  minutes: number;
}) {
  const date = day.date ? parseDate(day.date) : null;
  const meta: { icon?: React.ReactNode; text: string }[] = [];
  if (date) meta.push({ icon: <CalendarDays size={11} aria-hidden />, text: `${date.month} 月 ${date.day} 日 · 周${date.weekday}` });
  if (weather) meta.push({ text: weatherText(weather) });
  meta.push({ text: `${stopCount} 站` });
  if (modes.length) meta.push({ text: modes.map((m) => MODE_LABEL[m]).join("·") });
  if (minutes > 0) meta.push({ text: `约 ${Math.ceil(minutes / 60)} 时` });
  return (
    <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right text-xs leading-5 text-muted">
      {meta.map((m, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {m.icon}
          {m.text}
        </span>
      ))}
    </div>
  );
}

function weatherText(info: DayWeatherInfo): string {
  if (info.forecast !== undefined) {
    return info.forecast ? `${info.forecast.dayWeather} ${info.forecast.tempLow}~${info.forecast.tempHigh}°` : "暂无预报";
  }
  return `${info.weather ?? ""}${info.temperature ? ` ${info.temperature}°` : ""}`;
}

function parseDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][new Date(y!, m! - 1, d!).getDay()];
  return { month: m!, day: d!, weekday };
}

/* ------------------------------- 地图覆盖物 ------------------------------- */

function ShareLayers({ map, data, playing }: { map: AmapMap; data: TripData; playing: boolean }) {
  const overlaysRef = useRef<AmapOverlay[]>([]);
  const playRef = useRef<AmapOverlay | null>(null);
  useEffect(() => {
    if (!window.AMap) return;
    try {
      map.remove(overlaysRef.current);
    } catch {
      // 防御：map 可能已被 MapView 销毁
    }
    const overlays: AmapOverlay[] = [
      ...data.segments.flatMap((segment) => {
        const parts = segment.parts && segment.parts.length > 0
          ? segment.parts
          : [{ kind: segment.mode as "transit" | "walking" | "driving" | "cycling", coordinates: segment.geometry.coordinates }];
        return parts.map((part) => new window.AMap!.Polyline({
          path: part.coordinates,
          strokeColor: segment.degraded ? AMBER : part.kind === "walking" ? GREEN_LIGHT : GREEN,
          strokeWeight: 4,
          strokeOpacity: 0.9,
          strokeStyle: segment.degraded || part.kind === "walking" ? "dashed" : undefined,
        }));
      }),
      ...data.stops.map((stop) => new window.AMap!.Marker({
        position: [stop.lng, stop.lat],
        content: `<span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:9999px;border:2px solid ${GREEN};background:#fff;color:${GREEN};font:600 11px/1 -apple-system,system-ui,sans-serif">${stopContentLabel(data, stop.id)}</span>`,
        anchor: "center",
      })),
    ];
    try {
      map.add(overlays);
      overlaysRef.current = overlays;
      if (overlays.length) map.setFitView(overlays, true, [20, 20, 20, 20], 8);
    } catch {
      // 同上：map 已销毁时静默跳过
    }
    return () => {
      try {
        map.remove(overlays);
      } catch {
        // 同上
      }
    };
  }, [map, data]);
  useEffect(() => {
    const points = data.segments.flatMap((segment) => segment.geometry.coordinates);
    if (!playing || points.length < 2 || !window.AMap) { playRef.current?.setMap(null); playRef.current = null; return; }
    const marker = new window.AMap.Marker({
      position: points[0],
      content: `<span style="display:block;width:14px;height:14px;border:2px solid white;border-radius:50%;background:${GOLD}"></span>`,
      anchor: "center",
    });
    map.add(marker);
    playRef.current = marker;
    const start = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / 8000);
      const point = points[Math.min(points.length - 1, Math.floor(t * (points.length - 1)))];
      marker.setPosition?.(point);
      map.setCenter(point);
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); marker.setMap(null); };
  }, [map, data, playing]);
  return null;
}

/** 分享地图上站点编号：按天内的顺序（与编辑器/时间线一致）。 */
function stopContentLabel(data: TripData, stopId: string): string {
  const dayId = data.stops.find((s) => s.id === stopId)?.dayId;
  const list = data.stops.filter((s) => s.dayId === dayId).sort((a, b) => a.order - b.order);
  return String(list.findIndex((s) => s.id === stopId) + 1);
}

/* ------------------------------- 导航链接 ------------------------------- */

function navLink(stop: TripStop, mode?: Mode) {
  const url = new URL("https://uri.amap.com/navigation");
  url.searchParams.set("to", `${stop.lng},${stop.lat}`);
  url.searchParams.set("toName", stop.name || "地点");
  if (mode) url.searchParams.set("mode", NAV_MODE[mode]);
  return url.toString();
}

function nextStopNavLink(data: TripData) {
  const firstStop = [...data.stops].sort((a, b) => a.order - b.order)[0];
  if (!firstStop) return "https://uri.amap.com/";
  const intoMode = data.segments.find((seg) => seg.toStop === firstStop.id)?.mode;
  return navLink(firstStop, intoMode);
}