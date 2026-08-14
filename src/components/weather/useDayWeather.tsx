"use client";

import { useEffect, useRef, useState } from "react";
import type { TripData } from "@/lib/types";

export interface ForecastBadge {
  date: string;
  dayWeather: string;
  nightWeather: string;
  tempHigh: number;
  tempLow: number;
}

/**
 * 天气信息（三态）：
 * - 无 date 取数 → 实时天气（weather/temperature）；
 * - 有 date 且在预报窗口 → forecast 有值；
 * - 有 date 但超出窗口 → forecast 为 null（前端显示「暂无预报」）。
 */
export type DayWeatherInfo =
  | { city: string; weather: string; temperature: string; forecast?: undefined }
  | { city: string; forecast: ForecastBadge | null };

interface WeatherPoint {
  dayId: string;
  date?: string;
  lng: number;
  lat: number;
}

/** 每天取「该天首个站点」所在城市；date 来自天本身（绑定日期后走预报）。 */
export function weatherPoints(data: Pick<TripData, "days" | "stops">): WeatherPoint[] {
  const byDay = new Map<string, { date?: string; lng: number; lat: number }>();
  for (const stop of data.stops) {
    if (byDay.has(stop.dayId)) continue;
    byDay.set(stop.dayId, { date: data.days.find((d) => d.id === stop.dayId)?.date, lng: stop.lng, lat: stop.lat });
  }
  return Array.from(byDay.entries()).map(([dayId, p]) => ({ dayId, date: p.date, lng: p.lng, lat: p.lat }));
}

/**
 * 按天拉取天气（实时或按日期预报）。
 * points 引用应来自不可变数据（weatherPoints(data)，data 变化才会重新取数）；
 * 同一进程里的 /api/weather 还有服务端缓存（实时 10 分钟 / 预报 1 小时），进一步省配额。
 */
export function useDayWeather(points: ReadonlyArray<WeatherPoint>): Record<string, DayWeatherInfo | null> {
  const [byDay, setByDay] = useState<Record<string, DayWeatherInfo | null>>({});
  const fetchedRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    for (const point of points) {
      const key = `${point.dayId}|${point.date ?? ""}`;
      if (fetchedRef.current.has(key)) continue;
      fetchedRef.current.add(key);
      void (async () => {
        try {
          const params = new URLSearchParams({ lng: String(point.lng), lat: String(point.lat) });
          if (point.date) params.set("date", point.date);
          const res = await fetch(`/api/weather?${params}`);
          if (!res.ok) throw new Error("weather_failed");
          const data = (await res.json()) as DayWeatherInfo;
          if (!cancelled) setByDay((prev) => ({ ...prev, [point.dayId]: data }));
        } catch {
          if (!cancelled) setByDay((prev) => ({ ...prev, [point.dayId]: null }));
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [points]);

  return byDay;
}

/** 天气徽标（加载前后占用一致高度，避免布局跳动）。 */
export function WeatherBadge({ info }: { info: DayWeatherInfo | null | undefined }) {
  if (!info) return <span className="inline-flex h-5 items-center text-xs text-zinc-400" />;
  if (info.forecast !== undefined) {
    const text = info.forecast
      ? `${info.forecast.dayWeather} ${info.forecast.tempLow}~${info.forecast.tempHigh}°`
      : "暂无预报";
    return (
      <span className="inline-flex h-5 items-center text-xs text-zinc-500 dark:text-zinc-400" title={info.forecast?.nightWeather ? `夜间 ${info.forecast.nightWeather}` : undefined}>
        {info.city} · {text}
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 items-center text-xs text-zinc-500 dark:text-zinc-400">
      {info.city ?? ""}
      {info.city ? " · " : ""}
      {info.weather ?? ""}
      {info.temperature ? ` ${info.temperature}°C` : ""}
    </span>
  );
}