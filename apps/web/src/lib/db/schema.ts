import { desc } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { TripData } from "@roam/core";

/** 三张业务表统一规范列序：业务字段在前，审计字段（creator_id, created_at, updater_id, updated_at, is_deleted）置尾。 */

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shareId: text("share_id").notNull().unique(),
    ownerId: text("owner_id").notNull(),
    title: text("title"),
    data: jsonb("data").$type<TripData>().notNull(),
    creatorId: text("creator_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updaterId: text("updater_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
  },
  // 首页列表（listByOwner）与认领（claimTrips）都按 owner 过滤；加 updated_at 排序键避免 Sort 节点
  (t) => [index("trips_owner_updated_idx").on(t.ownerId, desc(t.updatedAt))],
);

export const profiles = pgTable("profiles", {
  ownerId: text("owner_id").primaryKey(),
  nickname: text("nickname").notNull(),
  creatorId: text("creator_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updaterId: text("updater_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});

/** 收藏：登录用户把分享行程复制为自己的行程（迁移 0003）。 */
export const savedTrips = pgTable(
  "saved_trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    sourceShareId: text("source_share_id").notNull(),
    tripId: uuid("trip_id").notNull(),
    creatorId: text("creator_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updaterId: text("updater_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
  },
  (t) => [
    uniqueIndex("saved_trips_owner_source_uq").on(t.ownerId, t.sourceShareId),
    // remove() 按 trip_id 做级联逻辑删除，无索引会退化为全表扫描
    index("saved_trips_trip_id_idx").on(t.tripId),
  ],
);

/**
 * 移动端设备令牌：Bearer 身份凭证（原文不落库，仅存 sha256）。
 * ownerId 初始为设备匿名身份；绑定为登录用户时改指用户 id。
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    ownerId: text("owner_id").notNull(),
    creatorId: text("creator_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updaterId: text("updater_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
  },
  (t) => [index("api_tokens_owner_idx").on(t.ownerId)],
);

/** 设备配对：App 发起配对码 → 用户在已登录的 Web 页输入确认，完成账号绑定。 */
export const devicePairs = pgTable("device_pairs", {
  code: text("code").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").default(false).notNull(),
  creatorId: text("creator_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updaterId: text("updater_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});