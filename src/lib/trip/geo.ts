import type { Position } from "@/lib/types";

export function roughDistanceM(a: Position, b: Position): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} 公里`;
  return `${Math.round(m)} 米`;
}

export function formatDuration(min: number): string {
  if (min >= 60) return `${Math.floor(min / 60)} 小时 ${min % 60} 分`;
  return `${min} 分钟`;
}
