import type { NewTripInput, Trip } from "@/lib/types";

export interface TripRepo {
  create(input: NewTripInput): Promise<Trip>;
  getById(id: string): Promise<Trip | null>;
  getByShareId(shareId: string): Promise<Trip | null>;
  update(id: string, ownerId: string, patch: { data?: unknown; title?: string }): Promise<Trip | null>;
  listByOwner(ownerId: string, limit?: number): Promise<Trip[]>;
  setNickname(ownerId: string, nickname: string): Promise<void>;
  getNickname(ownerId: string): Promise<string | null>;
}

function toTrip(row: {
  id: string;
  shareId: string;
  ownerId: string;
  nickname: string | null;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  data: unknown;
}): Trip {
  return {
    id: row.id,
    shareId: row.shareId,
    ownerId: row.ownerId,
    nickname: row.nickname,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    data: row.data as Trip["data"],
  };
}

export { toTrip };
