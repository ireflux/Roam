import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "@/lib/db/schema";
import { toTrip, type TripRepo } from "@/lib/db/repo";
import type { NewTripInput, TripData, Trip } from "@/lib/types";

export class NeonTripRepo implements TripRepo {
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(connectionString: string) {
    const client = neon(connectionString);
    this.db = drizzle(client, { schema });
    // 冷启动预热：Neon 连接首次握手慢，提前 ping 避免用户首个请求超时
    this.db.execute(sql`select 1`).catch(() => {});
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        const ms = 200 * 2 ** i;
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
    patch: { data?: TripData; title?: string },
  ): Promise<Trip | null> {
    return this.withRetry(async () => {
      const [row] = await this.db
        .update(schema.trips)
        .set({
          updatedAt: new Date(),
          data: patch.data,
          title: patch.title,
        })
        .where(eq(schema.trips.id, id))
        .returning();
      if (!row || row.ownerId !== ownerId) return null;
      return toTrip(row);
    });
  }

  async listByOwner(ownerId: string, limit = 10): Promise<Trip[]> {
    return this.withRetry(async () => {
      const rows = await this.db
        .select()
        .from(schema.trips)
        .where(eq(schema.trips.ownerId, ownerId))
        .orderBy(schema.trips.updatedAt)
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
}
