import { desc } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { TripData } from "@/lib/types";

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shareId: text("share_id").notNull().unique(),
    ownerId: text("owner_id").notNull(),
    creatorId: text("creator_id").notNull(),
    updaterId: text("updater_id").notNull(),
    isDelete: boolean("is_delete").default(false).notNull(),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    data: jsonb("data").$type<TripData>().notNull(),
  },
  // 首页列表（listByOwner）与认领（claimTrips）都按 owner 过滤；加 updated_at 排序键避免 Sort 节点
  (t) => [index("trips_owner_updated_idx").on(t.ownerId, desc(t.updatedAt))],
);

export const profiles = pgTable("profiles", {
  ownerId: text("owner_id").primaryKey(),
  creatorId: text("creator_id").notNull(),
  updaterId: text("updater_id").notNull(),
  isDelete: boolean("is_delete").default(false).notNull(),
  nickname: text("nickname").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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
    updaterId: text("updater_id").notNull(),
    isDelete: boolean("is_delete").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("saved_trips_owner_source_uq").on(t.ownerId, t.sourceShareId)],
);
