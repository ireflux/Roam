import type { NewTripInput, PublicTrip, Trip, TripData } from "@/lib/types";

export interface TripRepo {
  create(input: NewTripInput): Promise<Trip>;
  getById(id: string): Promise<Trip | null>;
  getByShareId(shareId: string): Promise<Trip | null>;
  update(
    id: string,
    ownerId: string,
    patch: { data?: TripData; title?: string; expectedUpdatedAt?: string },
  ): Promise<Trip | null>;
  /** 硬删除；仅当 id 存在且属于 ownerId 时返回 true，否则 false。 */
  remove(id: string, ownerId: string): Promise<boolean>;
  listByOwner(ownerId: string, limit?: number): Promise<Trip[]>;
  setNickname(ownerId: string, nickname: string): Promise<void>;
  getNickname(ownerId: string): Promise<string | null>;
}

function toTrip(row: {
  id: string;
  shareId: string;
  ownerId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  data: unknown;
}): Trip {
  return {
    id: row.id,
    shareId: row.shareId,
    ownerId: row.ownerId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    data: row.data as Trip["data"],
  };
}

export { toTrip };

export function toPublicTrip(trip: Trip): PublicTrip {
  return {
    id: trip.id,
    shareId: trip.shareId,
    title: trip.title,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
    data: trip.data,
  };
}
