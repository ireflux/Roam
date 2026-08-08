export type Mode = "driving" | "walking" | "cycling" | "transit";
export type SegmentKind = "auto" | "freehand" | "snapped";
export type Position = [number, number];

export interface LineGeometry {
  type: "LineString";
  coordinates: Position[];
}

/** 公交/地铁段的子段：公交实线 + 步行虚线，分别渲染以展示换乘。 */
export interface SegmentPart {
  kind: "transit" | "walking";
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
  /** 公交/地铁段的可选子段（公交实线 + 步行虚线）；其余出行方式不设置。 */
  parts?: SegmentPart[];
  /** 规划失败降级为直线的标记（持久化；与 kind 语义正交：kind 表示线来源，degraded 表示未按真实道路渲染）。 */
  degraded?: boolean;
}

export interface TripDay {
  id: string;
  name?: string;
  note?: string;
}

export interface TripData {
  days: TripDay[];
  stops: TripStop[];
  segments: TripSegment[];
}

export interface Trip {
  id: string;
  shareId: string;
  ownerId: string;
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
  transit: "公交/地铁",
};

export const MODE_ICON: Record<Mode, string> = {
  driving: "🚗",
  walking: "🚶",
  cycling: "🚲",
  transit: "🚇",
};
