-- 修复 0001 空迁移遗留：trips.nickname 已迁移至 profiles 表（见 0000→0001 快照），
-- 但 0001 的 SQL 为空，实际库中该列从未被删除。此处幂等清理，重复执行安全。
--> statement-breakpoint
ALTER TABLE "trips" DROP COLUMN IF EXISTS "nickname";