import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import * as schema from "@/lib/db/schema";
import {
  toTrip,
  type DeltaResult,
  type TripRepo,
  type UpsertTripInput,
  type UpsertTripResult,
} from "@/lib/db/repo";
import type { NewTripInput, TripData, Trip } from "@roam/core";

export class NeonTripRepo implements TripRepo {
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(connectionString: string) {
    // 使用 Pooled 连接串（*-pooler.*.neon.tech，PgBouncer 托管）：
    // 代理不会回收空闲连接，驱动默认 keep-alive 可安全复用，无需自定义 dispatcher。
    const client = neon(connectionString);
    this.db = drizzle(client, { schema });
    // 冷启动预热：Neon 连接首次握手慢，提前 ping 避免用户首个请求超时
    this.db.execute(sql`select 1`).catch(() => {});
  }

  /** 仅对瞬时错误重试：网络中断/超时、5xx、429。4xx（如唯一约束冲突）立即失败，避免无谓等待。 */
  private isRetryable(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const e = err as { code?: string | number; status?: number; message?: string };
    if (typeof e.status === "number") return e.status >= 500 || e.status === 429;
    if (typeof e.code === "number") return e.code >= 500 || e.code === 429;
    if (typeof e.code === "string") {
      if (/^(ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR_SOCKET_|UND_ERR_CONNECT_)/.test(e.code)) return true;
      if (/^P[0-9]+$/.test(e.code)) return false;
    }
    if (typeof e.message === "string" && /timeout|temporarily unavailable|connect/i.test(e.message)) return true;
    return false;
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        if (!this.isRetryable(e) || i === attempts - 1) throw e;
        // 500ms 起退避：给 Neon compute 冷启动（休眠唤醒）留出时间，避免唤醒期间重试全部落空
        const ms = 500 * 2 ** i;
        await new Promise((r) => setTimeout(r, ms));
      }
    }
    throw lastErr;
  }

  async create(input: NewTripInput): Promise<Trip> {
    return this.withRetry(async () => {
      const [row] = await this.db
        .insert(schema.trips)
        .values({
          shareId: input.shareId,
          ownerId: input.ownerId,
          creatorId: input.ownerId,
          updaterId: input.ownerId,
          // 显式写入毫秒精度：Postgres now() 带微秒，经 JS Date 往返会截断，
          // 与客户端乐观锁比较时产生误判（见 update 的 1ms 窗口说明）
          updatedAt: new Date(),
          title: input.title ?? null,
          data: input.data ?? { days: [], stops: [], segments: [] },
        })
        .returning();
      return toTrip(row);
    });
  }

  async getById(id: string): Promise<Trip | null> {
    return this.withRetry(async () => {
      const [row] = await this.db
        .select()
        .from(schema.trips)
        .where(and(eq(schema.trips.id, id), eq(schema.trips.isDeleted, false)))
        .limit(1);
      return row ? toTrip(row) : null;
    });
  }

  async getByShareId(shareId: string): Promise<Trip | null> {
    return this.withRetry(async () => {
      const [row] = await this.db
        .select()
        .from(schema.trips)
        .where(and(eq(schema.trips.shareId, shareId), eq(schema.trips.isDeleted, false)))
        .limit(1);
      return row ? toTrip(row) : null;
    });
  }

  async update(
    id: string,
    ownerId: string,
    patch: { data?: TripData; title?: string; expectedUpdatedAt?: string },
  ): Promise<Trip | null> {
    return this.withRetry(async () => {
      const conditions = [eq(schema.trips.id, id), eq(schema.trips.ownerId, ownerId), eq(schema.trips.isDeleted, false)];
      if (patch.expectedUpdatedAt !== undefined) {
        // 客户端只能表达毫秒精度（JS Date），而历史行仍是 now() 写入的微秒值，
        // 精确相等会把同一版本的微秒残差误判为并发冲突。改为 1ms 窗口比较：
        // 落在同一毫秒内的 DB 版本视为同一版本，同时仍能拦截跨毫秒的真实并发修改。
        const t = new Date(patch.expectedUpdatedAt).getTime();
        const start = new Date(t);
        const end = new Date(t + 1);
        conditions.push(sql`${schema.trips.updatedAt} >= ${start} AND ${schema.trips.updatedAt} < ${end}`);
      }
      const [row] = await this.db
        .update(schema.trips)
        .set({
          updatedAt: new Date(),
          updaterId: ownerId,
          ...(patch.data !== undefined ? { data: patch.data } : {}),
          ...(patch.title !== undefined ? { title: patch.title } : {}),
        })
        .where(and(...conditions))
        .returning();
      if (!row) return null;
      return toTrip(row);
    });
  }

  /** 逻辑删除：置 is_deleted 并级联逻辑删除收藏记录；不物理删行（收藏的 trip_id 为逻辑外键）。
   *  neon-http 驱动不支持事务，两条 update 顺序执行；级联为尽力而为的清理。 */
  async remove(id: string, ownerId: string): Promise<boolean> {
    return this.withRetry(async () => {
      const [row] = await this.db
        .update(schema.trips)
        .set({ isDeleted: true, updaterId: ownerId, updatedAt: new Date() })
        .where(and(eq(schema.trips.id, id), eq(schema.trips.ownerId, ownerId), eq(schema.trips.isDeleted, false)))
        .returning({ id: schema.trips.id });
      if (!row) return false;
      await this.db
        .update(schema.savedTrips)
        .set({ isDeleted: true, updaterId: ownerId })
        .where(and(eq(schema.savedTrips.tripId, id), eq(schema.savedTrips.isDeleted, false)));
      return true;
    });
  }

  async listByOwner(ownerId: string, limit = 10): Promise<Trip[]> {
    return this.withRetry(async () => {
      const rows = await this.db
        .select()
        .from(schema.trips)
        .where(and(eq(schema.trips.ownerId, ownerId), eq(schema.trips.isDeleted, false)))
        .orderBy(desc(schema.trips.updatedAt))
        .limit(limit);
      return rows.map(toTrip);
    });
  }

  async setNickname(ownerId: string, nickname: string): Promise<void> {
    return this.withRetry(async () => {
      await this.db
        .insert(schema.profiles)
        .values({ ownerId, creatorId: ownerId, updaterId: ownerId, nickname, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.profiles.ownerId,
          set: { updaterId: ownerId, nickname, updatedAt: new Date(), isDeleted: false },
        });
    });
  }

  async getNickname(ownerId: string): Promise<string | null> {
    return this.withRetry(async () => {
      const [row] = await this.db
        .select()
        .from(schema.profiles)
        .where(and(eq(schema.profiles.ownerId, ownerId), eq(schema.profiles.isDeleted, false)))
        .limit(1);
      return row?.nickname ?? null;
    });
  }

  async saveSharedTrip(ownerId: string, sourceShareId: string, tripId: string): Promise<void> {
    return this.withRetry(async () => {
      await this.db
        .insert(schema.savedTrips)
        .values({ ownerId, sourceShareId, tripId, creatorId: ownerId, updaterId: ownerId })
        .onConflictDoNothing();
    });
  }

  async getSavedTripId(ownerId: string, sourceShareId: string): Promise<string | null> {
    return this.withRetry(async () => {
      const [row] = await this.db
        .select({ tripId: schema.savedTrips.tripId })
        .from(schema.savedTrips)
        .where(
          and(
            eq(schema.savedTrips.ownerId, ownerId),
            eq(schema.savedTrips.sourceShareId, sourceShareId),
            eq(schema.savedTrips.isDeleted, false),
          ),
        )
        .limit(1);
      return row ? row.tripId.toString() : null;
    });
  }

  async claimTrips(fromOwnerId: string, toOwnerId: string): Promise<number> {
    return this.withRetry(async () => {
      const rows = await this.db
        .update(schema.trips)
        .set({ ownerId: toOwnerId, updaterId: toOwnerId, updatedAt: new Date() })
        .where(
          and(
            eq(schema.trips.ownerId, fromOwnerId),
            eq(schema.trips.isDeleted, false),
            sql`${schema.trips.ownerId} <> ${toOwnerId}`,
          ),
        )
        .returning({ id: schema.trips.id });
      return rows.length;
    });
  }

  async claimProfile(fromOwnerId: string, toOwnerId: string): Promise<void> {
    return this.withRetry(async () => {
      const [fromRow] = await this.db
        .select()
        .from(schema.profiles)
        .where(and(eq(schema.profiles.ownerId, fromOwnerId), eq(schema.profiles.isDeleted, false)))
        .limit(1);
      if (!fromRow) return;
      await this.db.delete(schema.profiles).where(eq(schema.profiles.ownerId, toOwnerId));
      await this.db
        .insert(schema.profiles)
        .values({
          ownerId: toOwnerId,
          creatorId: fromRow.creatorId,
          updaterId: toOwnerId,
          nickname: fromRow.nickname,
          updatedAt: new Date(),
        });
    });
  }

  // ---- 移动端同步与设备身份 ----

  async upsertTrip(input: UpsertTripInput): Promise<UpsertTripResult> {
    return this.withRetry(async () => {
      // 先走条件更新：命中即覆盖建档/更新/软删/复活四种情况（复活 = 已删行被重新写入数据）。
      const conditions = [eq(schema.trips.id, input.id), eq(schema.trips.ownerId, input.ownerId)];
      if (input.expectedUpdatedAt !== undefined) {
        // 与 update 相同的 1ms 窗口比较，规避微秒残差误判
        const t = new Date(input.expectedUpdatedAt).getTime();
        conditions.push(
          sql`${schema.trips.updatedAt} >= ${new Date(t)} AND ${schema.trips.updatedAt} < ${new Date(t + 1)}`,
        );
      }
      const [row] = await this.db
        .update(schema.trips)
        .set({
          updatedAt: new Date(),
          updaterId: input.ownerId,
          ...(input.data !== undefined ? { data: input.data } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.deleted !== undefined ? { isDeleted: input.deleted } : {}),
        })
        .where(and(...conditions))
        .returning();
      if (row) return { ok: true, trip: toTrip(row) };

      // 未命中：不存在 → 插入；属于他人 → forbidden；版本不匹配 → conflict
      const [existing] = await this.db.select().from(schema.trips).where(eq(schema.trips.id, input.id)).limit(1);
      if (!existing) {
        const emptyData: TripData = { days: [], stops: [], segments: [] };
        const [inserted] = await this.db
          .insert(schema.trips)
          .values({
            id: input.id,
            shareId: nanoid(16),
            ownerId: input.ownerId,
            creatorId: input.ownerId,
            updaterId: input.ownerId,
            title: input.title ?? null,
            data: input.data ?? emptyData,
            isDeleted: input.deleted === true,
          })
          .onConflictDoNothing()
          .returning();
        if (inserted) return { ok: true, trip: toTrip(inserted) };
        // 并发建档竞争：重查后按冲突处理
        return this.classifyMiss(input.id, input.ownerId);
      }
      if (existing.ownerId !== input.ownerId) return { ok: false, reason: "forbidden" };
      return { ok: false, reason: "conflict", serverUpdatedAt: existing.updatedAt.toISOString() };
    });
  }

  private async classifyMiss(id: string, ownerId: string): Promise<UpsertTripResult> {
    const [existing] = await this.db.select().from(schema.trips).where(eq(schema.trips.id, id)).limit(1);
    if (existing && existing.ownerId !== ownerId) return { ok: false, reason: "forbidden" };
    if (existing) return { ok: false, reason: "conflict", serverUpdatedAt: existing.updatedAt.toISOString() };
    // 行程在检查间隙被物理清除等极端情况：按冲突上报，客户端拉取后自愈
    return { ok: false, reason: "conflict", serverUpdatedAt: new Date().toISOString() };
  }

  async listChangedSince(ownerId: string, since: Date, limit: number): Promise<DeltaResult> {
    return this.withRetry(async () => {
      const rows = await this.db
        .select()
        .from(schema.trips)
        .where(and(eq(schema.trips.ownerId, ownerId), gt(schema.trips.updatedAt, since)))
        .orderBy(asc(schema.trips.updatedAt))
        .limit(limit);
      return {
        trips: rows.filter((r) => !r.isDeleted).map(toTrip),
        deletedIds: rows.filter((r) => r.isDeleted).map((r) => r.id),
      };
    });
  }

  async createApiToken(tokenHash: string, ownerId: string): Promise<void> {
    return this.withRetry(async () => {
      await this.db
        .insert(schema.apiTokens)
        .values({ tokenHash, ownerId, creatorId: ownerId, updaterId: ownerId });
    });
  }

  async resolveApiToken(tokenHash: string): Promise<string | null> {
    const [row] = await this.db
      .select({ ownerId: schema.apiTokens.ownerId })
      .from(schema.apiTokens)
      .where(and(eq(schema.apiTokens.tokenHash, tokenHash), eq(schema.apiTokens.isDeleted, false)))
      .limit(1);
    return row?.ownerId ?? null;
  }

  async bindApiTokenOwner(tokenHash: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .update(schema.apiTokens)
      .set({ ownerId: userId, updaterId: userId, updatedAt: new Date() })
      .where(and(eq(schema.apiTokens.tokenHash, tokenHash), eq(schema.apiTokens.isDeleted, false)))
      .returning({ tokenHash: schema.apiTokens.tokenHash });
    return row !== undefined;
  }

  async createDevicePair(code: string, tokenHash: string, ownerId: string, expiresAt: Date): Promise<void> {
    return this.withRetry(async () => {
      // 惰性清理过期配对码，保持表轻量
      await this.db.delete(schema.devicePairs).where(sql`${schema.devicePairs.expiresAt} < now()`);
      await this.db.insert(schema.devicePairs).values({
        code,
        tokenHash,
        expiresAt,
        creatorId: ownerId,
        updaterId: ownerId,
      });
    });
  }

  async consumeDevicePair(code: string): Promise<string | null> {
    const now = new Date();
    // 原子消费：仅未使用且未过期时可置 used，防并发重复消费
    const [row] = await this.db
      .update(schema.devicePairs)
      .set({ used: true, updaterId: "pair-confirm", updatedAt: now })
      .where(
        and(
          eq(schema.devicePairs.code, code),
          eq(schema.devicePairs.used, false),
          eq(schema.devicePairs.isDeleted, false),
          gt(schema.devicePairs.expiresAt, now),
        ),
      )
      .returning({ tokenHash: schema.devicePairs.tokenHash });
    return row?.tokenHash ?? null;
  }
}
