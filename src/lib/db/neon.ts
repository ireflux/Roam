import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { Agent } from "undici";
import * as schema from "@/lib/db/schema";
import { toTrip, type TripRepo } from "@/lib/db/repo";
import type { NewTripInput, TripData, Trip } from "@/lib/types";

export class NeonTripRepo implements TripRepo {
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(connectionString: string) {
    // 禁用 keep-alive：Neon 代理会关闭空闲连接，undici 复用失效 socket 会抛
    // "fetch failed"（间歇性 500）。HTTP 驱动无状态，每查询新建连接代价可忽略。
    const client = neon(connectionString, {
      fetchOptions: {
        dispatcher: new Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 }),
      },
    });
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
        .where(eq(schema.trips.id, id))
        .limit(1);
      return row ? toTrip(row) : null;
    });
  }

  async getByShareId(shareId: string): Promise<Trip | null> {
    return this.withRetry(async () => {
      const [row] = await this.db
        .select()
        .from(schema.trips)
        .where(eq(schema.trips.shareId, shareId))
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
      const conditions = [eq(schema.trips.id, id), eq(schema.trips.ownerId, ownerId)];
      if (patch.expectedUpdatedAt !== undefined) {
        conditions.push(eq(schema.trips.updatedAt, new Date(patch.expectedUpdatedAt)));
      }
      const [row] = await this.db
        .update(schema.trips)
        .set({
          updatedAt: new Date(),
          ...(patch.data !== undefined ? { data: patch.data } : {}),
          ...(patch.title !== undefined ? { title: patch.title } : {}),
        })
        .where(and(...conditions))
        .returning();
      if (!row) return null;
      return toTrip(row);
    });
  }

  async remove(id: string, ownerId: string): Promise<boolean> {
    return this.withRetry(async () => {
      const [row] = await this.db
        .delete(schema.trips)
        .where(and(eq(schema.trips.id, id), eq(schema.trips.ownerId, ownerId)))
        .returning({ id: schema.trips.id });
      return Boolean(row);
    });
  }

  async listByOwner(ownerId: string, limit = 10): Promise<Trip[]> {
    return this.withRetry(async () => {
      const rows = await this.db
        .select()
        .from(schema.trips)
        .where(eq(schema.trips.ownerId, ownerId))
        .orderBy(desc(schema.trips.updatedAt))
        .limit(limit);
      return rows.map(toTrip);
    });
  }

  async setNickname(ownerId: string, nickname: string): Promise<void> {
    return this.withRetry(async () => {
      await this.db
        .insert(schema.profiles)
        .values({ ownerId, nickname, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.profiles.ownerId,
          set: { nickname, updatedAt: new Date() },
        });
    });
  }

  async getNickname(ownerId: string): Promise<string | null> {
    return this.withRetry(async () => {
      const [row] = await this.db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.ownerId, ownerId))
        .limit(1);
      return row?.nickname ?? null;
    });
  }

  async saveSharedTrip(ownerId: string, sourceShareId: string, tripId: string): Promise<void> {
    return this.withRetry(async () => {
      await this.db
        .insert(schema.savedTrips)
        .values({ ownerId, sourceShareId, tripId })
        .onConflictDoNothing();
    });
  }

  async getSavedTripId(ownerId: string, sourceShareId: string): Promise<string | null> {
    return this.withRetry(async () => {
      const [row] = await this.db
        .select({ tripId: schema.savedTrips.tripId })
        .from(schema.savedTrips)
        .where(and(eq(schema.savedTrips.ownerId, ownerId), eq(schema.savedTrips.sourceShareId, sourceShareId)))
        .limit(1);
      return row ? row.tripId.toString() : null;
    });
  }

  async claimTrips(fromOwnerId: string, toOwnerId: string): Promise<number> {
    return this.withRetry(async () => {
      const rows = await this.db
        .update(schema.trips)
        .set({ ownerId: toOwnerId, updatedAt: new Date() })
        .where(and(eq(schema.trips.ownerId, fromOwnerId), sql`${schema.trips.ownerId} <> ${toOwnerId}`))
        .returning({ id: schema.trips.id });
      return rows.length;
    });
  }

  async claimProfile(fromOwnerId: string, toOwnerId: string): Promise<void> {
    return this.withRetry(async () => {
      await this.db.transaction(async (tx) => {
        const [fromRow] = await tx
          .select()
          .from(schema.profiles)
          .where(eq(schema.profiles.ownerId, fromOwnerId))
          .limit(1);
        if (!fromRow) return;
        await tx.delete(schema.profiles).where(eq(schema.profiles.ownerId, toOwnerId));
        await tx.insert(schema.profiles).values({ ownerId: toOwnerId, nickname: fromRow.nickname, updatedAt: new Date() });
      });
    });
  }
}
