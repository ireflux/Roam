-- 审计字段：创建人/更新人/逻辑删除。存量行以 owner_id 回填 creator/updater。
-- 注意：新增 NOT NULL 列需「可空添加 → 回填 → 收紧」，直接 NOT NULL 会在非空表上失败（end state 与 snapshot 一致）。
ALTER TABLE "profiles" ADD COLUMN "creator_id" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "updater_id" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "is_delete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "profiles" SET "creator_id" = "owner_id", "updater_id" = "owner_id" WHERE "creator_id" IS NULL;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "creator_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "updater_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_trips" ADD COLUMN "creator_id" text;--> statement-breakpoint
ALTER TABLE "saved_trips" ADD COLUMN "updater_id" text;--> statement-breakpoint
ALTER TABLE "saved_trips" ADD COLUMN "is_delete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "saved_trips" SET "creator_id" = "owner_id", "updater_id" = "owner_id" WHERE "creator_id" IS NULL;--> statement-breakpoint
ALTER TABLE "saved_trips" ALTER COLUMN "creator_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_trips" ALTER COLUMN "updater_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "creator_id" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "updater_id" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "is_delete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "trips" SET "creator_id" = "owner_id", "updater_id" = "owner_id" WHERE "creator_id" IS NULL;--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "creator_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "updater_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "trips_owner_updated_idx" ON "trips" USING btree ("owner_id","updated_at" desc);