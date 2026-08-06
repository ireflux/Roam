import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
