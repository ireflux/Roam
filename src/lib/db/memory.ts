import type { NewTripInput, Trip, TripData } from "@/lib/types";
import { toTrip, type TripRepo } from "@/lib/db/repo";

export class MemoryTripRepo implements TripRepo {
  private trips = new Map<string, Trip>();
  private nicknames = new Map<string, string>();
  private saved = new Set<string>();
  private savedIds = new Map<string, string>();

  private savedKey(ownerId: string, sourceShareId: string): string {
    return `${ownerId}|${sourceShareId}`;
  }

  async create(input: NewTripInput): Promise<Trip> {
    const now = new Date().toISOString();
    const trip: Trip = {
      id: crypto.randomUUID(),
      shareId: input.shareId,
      ownerId: input.ownerId,
      title: input.title ?? null,
      createdAt: now,
      updatedAt: now,
      data: input.data ?? { days: [], stops: [], segments: [] },
    };
    this.trips.set(trip.id, trip);
    return trip;
  }

  async getById(id: string): Promise<Trip | null> {
    return this.trips.get(id) ?? null;
  }

  async getByShareId(shareId: string): Promise<Trip | null> {
    for (const trip of this.trips.values()) {
      if (trip.shareId === shareId) return trip;
    }
    return null;
  }

  async update(
    id: string,
    ownerId: string,
    patch: { data?: TripData; title?: string; expectedUpdatedAt?: string },
  ): Promise<Trip | null> {
    const trip = this.trips.get(id);
    if (!trip || trip.ownerId !== ownerId) return null;
    // 内存实现存 ISO 字符串，直接字符串比较；不匹配视为并发冲突，返回 null。
    if (patch.expectedUpdatedAt !== undefined && trip.updatedAt !== patch.expectedUpdatedAt) return null;
    const updated: Trip = {
      ...trip,
      ...(patch.data !== undefined ? { data: patch.data } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.trips.set(id, updated);
    return updated;
  }

  async remove(id: string, ownerId: string): Promise<boolean> {
    const trip = this.trips.get(id);
    if (!trip || trip.ownerId !== ownerId) return false;
    this.trips.delete(id);
    return true;
  }

  async listByOwner(ownerId: string, limit = 10): Promise<Trip[]> {
    return [...this.trips.values()]
      .filter((t) => t.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((t) =>
        toTrip({
          ...t,
          title: t.title ?? null,
          createdAt: new Date(t.createdAt),
          updatedAt: new Date(t.updatedAt),
        }),
      );
  }

  async setNickname(ownerId: string, nickname: string): Promise<void> {
    this.nicknames.set(ownerId, nickname);
  }

  async getNickname(ownerId: string): Promise<string | null> {
    return this.nicknames.get(ownerId) ?? null;
  }

  async saveSharedTrip(ownerId: string, sourceShareId: string, tripId: string): Promise<void> {
    const key = this.savedKey(ownerId, sourceShareId);
    this.saved.add(key);
    // 与 Neon 的 onConflictDoNothing 对齐：首次收藏生效，重复收藏保留原复制品
    if (!this.savedIds.has(key)) this.savedIds.set(key, tripId);
  }

  async getSavedTripId(ownerId: string, sourceShareId: string): Promise<string | null> {
    return this.savedIds.get(this.savedKey(ownerId, sourceShareId)) ?? null;
  }

  async claimTrips(fromOwnerId: string, toOwnerId: string): Promise<number> {
    if (fromOwnerId === toOwnerId) return 0;
    let count = 0;
    for (const [id, trip] of this.trips) {
      if (trip.ownerId === fromOwnerId) {
        this.trips.set(id, { ...trip, ownerId: toOwnerId, updatedAt: new Date().toISOString() });
        count++;
      }
    }
    return count;
  }

  async claimProfile(fromOwnerId: string, toOwnerId: string): Promise<void> {
    if (fromOwnerId === toOwnerId) return;
    const nickname = this.nicknames.get(fromOwnerId);
    if (!nickname) return;
    this.nicknames.delete(fromOwnerId);
    this.nicknames.set(toOwnerId, nickname);
  }
}
