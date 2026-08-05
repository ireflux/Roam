import type { TripData } from "@/lib/types";

const MAX_DAYS = 60;
const MAX_STOPS = 500;
const MAX_SEGMENTS = 500;
const MAX_POINTS_PER_SEGMENT = 5_000;

function isPosition(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "number"
    && typeof value[1] === "number"
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && value[0] >= -180
    && value[0] <= 180
    && value[1] >= -90
    && value[1] <= 90;
}

/** Validates the persisted shape and bounds request work before it reaches Postgres. */
export function isTripData(value: unknown): value is TripData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<TripData>;
  if (!Array.isArray(data.days) || !Array.isArray(data.stops) || !Array.isArray(data.segments)) return false;
  if (data.days.length > MAX_DAYS || data.stops.length > MAX_STOPS || data.segments.length > MAX_SEGMENTS) return false;
  return data.days.every((day) => typeof day?.id === "string" && day.id.length > 0 && day.id.length <= 100)
    && data.stops.every((stop) =>
      typeof stop?.id === "string"
      && typeof stop.dayId === "string"
      && typeof stop.name === "string"
      && stop.name.length <= 200
      && typeof stop.lat === "number"
      && typeof stop.lng === "number"
      && Number.isFinite(stop.lat)
      && Number.isFinite(stop.lng)
      && stop.lat >= -90
      && stop.lat <= 90
      && stop.lng >= -180
      && stop.lng <= 180
      && Number.isInteger(stop.order)
      && stop.order >= 0,
    )
    && data.segments.every((segment) =>
      typeof segment?.id === "string"
      && typeof segment.fromStop === "string"
      && typeof segment.toStop === "string"
      && (segment.mode === "driving" || segment.mode === "walking" || segment.mode === "cycling")
      && (segment.kind === "auto" || segment.kind === "freehand" || segment.kind === "snapped")
      && segment.geometry?.type === "LineString"
      && Array.isArray(segment.geometry.coordinates)
      && segment.geometry.coordinates.length >= 2
      && segment.geometry.coordinates.length <= MAX_POINTS_PER_SEGMENT
      && segment.geometry.coordinates.every(isPosition),
    );
}
