import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { TripData } from "@/lib/types";

export const trips = pgTable("trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  shareId: text("share_id").notNull().unique(),
  ownerId: text("owner_id").notNull(),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  data: jsonb("data").$type<TripData>().notNull(),
});

export const profiles = pgTable("profiles", {
  ownerId: text("owner_id").primaryKey(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("saved_trips_owner_source_uq").on(t.ownerId, t.sourceShareId)],
);
