import type { NewTripInput, PublicTrip, Trip, TripData } from "@roam/core";

/** 移动端同步 upsert：客户端生成 id 的建档/更新/软删一体语义。 */
export interface UpsertTripInput {
  id: string;
  ownerId: string;
  title?: string;
  data?: TripData;
  deleted?: boolean;
  /** 更新已有行程时的乐观并发基准；新建路径忽略。 */
  expectedUpdatedAt?: string;
}

export type UpsertTripResult =
  | { ok: true; trip: Trip }
  | { ok: false; reason: "conflict"; serverUpdatedAt: string }
  | { ok: false; reason: "forbidden" };

export interface DeltaResult {
  trips: Trip[];
  deletedIds: string[];
}

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

  // ---- 移动端同步与设备身份 ----

  /** 幂等 upsert：id 不存在则建档（服务端生成 shareId），存在则按 owner + 乐观并发更新/软删。 */
  upsertTrip(input: UpsertTripInput): Promise<UpsertTripResult>;
  /** 增量拉取：updatedAt > since 的行程（含软删 tombstone），updatedAt 升序。 */
  listChangedSince(ownerId: string, since: Date, limit: number): Promise<DeltaResult>;
  createApiToken(tokenHash: string, ownerId: string): Promise<void>;
  /** 返回令牌对应的 ownerId；无效/已删除返回 null。 */
  resolveApiToken(tokenHash: string): Promise<string | null>;
  /** 绑定：把令牌的 ownerId 改指为登录用户 id。 */
  bindApiTokenOwner(tokenHash: string, userId: string): Promise<boolean>;
  /** 创建配对码记录（5 分钟有效，一次性）。 */
  createDevicePair(code: string, tokenHash: string, ownerId: string, expiresAt: Date): Promise<void>;
  /** 消费配对码：有效则返回其 tokenHash，并标记已用；否则 null。 */
  consumeDevicePair(code: string): Promise<string | null>;
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
