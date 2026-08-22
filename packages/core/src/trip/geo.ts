import type { Position } from "../types";

const M_PER_DEG_LAT = 111_320;
const DEG_TO_RAD = Math.PI / 180;

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

function metersPerDegLng(lat: number): number {
  return M_PER_DEG_LAT * Math.cos(lat * DEG_TO_RAD);
}

/** 点到线段（球面经纬度近似平面）的垂直距离，单位米。 */
function distPointToSegmentM(p: Position, a: Position, b: Position): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  const xMeters = (p[0] - projX) * metersPerDegLng((a[1] + b[1]) / 2);
  const yMeters = (p[1] - projY) * M_PER_DEG_LAT;
  return Math.hypot(xMeters, yMeters);
}

function douglasPeucker(points: Position[], toleranceM: number): Position[] {
  const n = points.length;
  if (n < 3) return points;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < n - 1; i++) {
    const d = distPointToSegmentM(points[i], points[0], points[n - 1]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > toleranceM) {
    const left = douglasPeucker(points.slice(0, index + 1), toleranceM);
    const right = douglasPeucker(points.slice(index), toleranceM);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[n - 1]];
}

/** 保留形态的折线简化：Douglas-Peucker + 兜底均匀采样 + 坐标取整（≈0.1m 精度）。 */
export function simplifyLine(
  coords: Position[],
  options: { toleranceM?: number; maxPoints?: number } = {},
): Position[] {
  const { toleranceM = 10, maxPoints = 2500 } = options;
  let out = douglasPeucker(coords, toleranceM);
  if (out.length > maxPoints) out = uniformSample(out, maxPoints);
  return out.map(([lng, lat]) => [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]);
}

/** 折线总路径长度（逐段球面距离求和），单位米。 */
export function pathLengthM(points: Position[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += roughDistanceM(points[i - 1], points[i]);
  }
  return total;
}

/** 折线上按累计路径长度比例取点（fraction ∈ [0,1]，线性插值），用于线段中点等定位。 */
export function pointAtFraction(points: Position[], fraction: number): Position {
  if (points.length === 0) return [0, 0];
  if (points.length === 1) return points[0];
  const target = pathLengthM(points) * Math.max(0, Math.min(1, fraction));
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const d = roughDistanceM(points[i - 1], points[i]);
    const prev = points[i - 1];
    const next = points[i];
    if (d === 0) continue;
    if (acc + d >= target) {
      const t = (target - acc) / d;
      return [
        prev[0] + (next[0] - prev[0]) * t,
        prev[1] + (next[1] - prev[1]) * t,
      ];
    }
    acc += d;
  }
  return points[points.length - 1];
}

/** 均匀采样到不超过 maxPoints 个点（保留首尾）。 */
export function uniformSample(coords: Position[], maxPoints: number): Position[] {
  if (coords.length <= maxPoints) return [...coords];
  const samples = simplifyVertexIndices(coords.length, maxPoints);
  return samples.map((i) => coords[i]);
}

/** 均匀采样的原始下标序列（保留首尾），用于把采样点映射回原始顶点。 */
export function simplifyVertexIndices(length: number, maxPoints: number): number[] {
  if (length <= maxPoints) return Array.from({ length }, (_, i) => i);
  const step = (length - 1) / (maxPoints - 1);
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(Math.round(i * step));
  }
  return out;
}