-- 初始基线迁移（2026-08-18 重置）：三张业务表统一规范
-- 列序约定：业务字段在前，审计字段（creator_id, created_at, updater_id, updated_at, is_deleted）置尾。
-- 表结构：
--   trips        行程主表（JSONB data 存全量行程快照，share_id 短链公开分享）
--   profiles     用户档案（owner_id 即用户 id，自然键主键，1:1）
--   saved_trips  收藏（owner+source 唯一去重，trip_id 逻辑外键）
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"title" text,
	"data" jsonb NOT NULL,
	"creator_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updater_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "trips_share_id_unique" UNIQUE("share_id")
);--> statement-breakpoint
CREATE INDEX "trips_owner_updated_idx" ON "trips" USING btree ("owner_id", "updated_at" DESC);--> statement-breakpoint
CREATE TABLE "profiles" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"creator_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updater_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL
);--> statement-breakpoint
CREATE TABLE "saved_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"source_share_id" text NOT NULL,
	"trip_id" uuid NOT NULL,
	"creator_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updater_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "saved_trips_owner_source_uq" ON "saved_trips" USING btree ("owner_id", "source_share_id");--> statement-breakpoint
CREATE INDEX "saved_trips_trip_id_idx" ON "saved_trips" USING btree ("trip_id");