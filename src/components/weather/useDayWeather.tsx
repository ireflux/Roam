"use client";

import { useEffect, useRef, useState } from "react";

export interface DayWeatherInfo {
  city?: string;
  weather?: string;
  temperature?: string;
}

interface WeatherPoint {
  dayId: string;
  lng: number;
  lat: number;
}

/**
 * 按天拉取「该天首个站点」所在城市的实时天气。
 * stops 引用应来自不可变数据（data.stops），保证只在数据真正变化时重新取数；
 * 同一进程里的 /api/weather 还有服务端 10 分钟缓存，进一步省配额。
 */
export function useDayWeather(stops: ReadonlyArray<WeatherPoint>): Record<string, DayWeatherInfo | null> {
  const [byDay, setByDay] = useState<Record<string, DayWeatherInfo | null>>({});
  const fetchedRef = useRef(new Set<string>());

  useEffect(() => {
    const first = new Map<string, { lng: number; lat: number }>();
    for (const point of stops) {
      if (!first.has(point.dayId)) first.set(point.dayId, { lng: point.lng, lat: point.lat });
    }
    let cancelled = false;
    for (const [dayId, pos] of first) {
      if (fetchedRef.current.has(dayId)) continue;
      fetchedRef.current.add(dayId);
      void (async () => {
        try {
          const res = await fetch(`/api/weather?lng=${pos.lng}&lat=${pos.lat}`);
          if (!res.ok) throw new Error("weather_failed");
          const data = (await res.json()) as DayWeatherInfo;
          if (!cancelled) setByDay((prev) => ({ ...prev, [dayId]: data }));
        } catch {
          if (!cancelled) setByDay((prev) => ({ ...prev, [dayId]: null }));
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [stops]);

  return byDay;
}

/** 天气徽标（加载前后占用一致高度，避免布局跳动）。 */
export function WeatherBadge({ info }: { info: DayWeatherInfo | null | undefined }) {
  if (!info) return <span className="inline-flex h-5 items-center text-xs text-zinc-400" />;
  return (
    <span className="inline-flex h-5 items-center text-xs text-zinc-500 dark:text-zinc-400">
      {info.city ?? ""}
      {info.city ? " · " : ""}
      {info.weather ?? ""}
      {info.temperature ? ` ${info.temperature}°C` : ""}
    </span>
  );
}