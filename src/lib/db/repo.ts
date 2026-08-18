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
  /** 收藏分享行程：写入 saved_trips（重复收藏天然去重）。 */
  saveSharedTrip(ownerId: string, sourceShareId: string, tripId: string): Promise<void>;
  /** 用户已收藏该分享行程时返回复制出的行程 id，否则 null。 */
  getSavedTripId(ownerId: string, sourceShareId: string): Promise<string | null>;
  /** 认领：把匿名 ownerId 名下的行程全部过户给登录用户（返回过户数）。 */
  claimTrips(fromOwnerId: string, toOwnerId: string): Promise<number>;
  /** 认领昵称：匿名行迁到登录用户（先删旧行防主键冲突）。 */
  claimProfile(fromOwnerId: string, toOwnerId: string): Promise<void>;
}

function toTrip(row: {
  id: string;
  shareId: string;
  ownerId: string;
  creatorId: string;
  updaterId: string;
  isDeleted: boolean;
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
