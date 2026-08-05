export type Mode = "driving" | "walking" | "cycling";
export type SegmentKind = "auto" | "freehand" | "snapped";
export type Position = [number, number];

export interface LineGeometry {
  type: "LineString";
  coordinates: Position[];
}

export interface TripStop {
  id: string;
  dayId: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  note?: string;
  order: number;
}

export interface TripSegment {
  id: string;
  fromStop: string;
  toStop: string;
  mode: Mode;
  kind: SegmentKind;
  geometry: LineGeometry;
  distanceM?: number;
  durationMin?: number;
}

export interface TripDay {
  id: string;
  name?: string;
  note?: string;
}

export interface MapViewState {
  center: Position;
  zoom: number;
  pitch: number;
}

export interface TripData {
  days: TripDay[];
  stops: TripStop[];
  segments: TripSegment[];
  mapView?: MapViewState;
}

export interface Trip {
  id: string;
  shareId: string;
  ownerId: string;
  nickname?: string | null;
  title?: string | null;
  createdAt: string;
  updatedAt: string;
  data: TripData;
}

export type PublicTrip = Omit<Trip, "ownerId">;

export interface NewTripInput {
  ownerId: string;
  shareId: string;
  title?: string;
  data?: TripData;
}

export const MODE_LABEL: Record<Mode, string> = {
  driving: "驾车",
  walking: "步行",
  cycling: "骑行",
};

export const MODE_ICON: Record<Mode, string> = {
  driving: "🚗",
  walking: "🚶",
  cycling: "🚲",
};
