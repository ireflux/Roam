import type { NewTripInput, Trip, TripData } from "@roam/core";
import { toTrip, type TripRepo } from "@/lib/db/repo";

/** 内存镜像：与 Neon 行为对齐，含审计字段与逻辑删除。 */
interface StoredTrip extends Trip {
  creatorId: string;
  updaterId: string;
  isDeleted: boolean;
}

interface StoredSaved {
  id: string;
  ownerId: string;
  sourceShareId: string;
  tripId: string;
  creatorId: string;
  updaterId: string;
  isDeleted: boolean;
}

export class MemoryTripRepo implements TripRepo {
  private trips = new Map<string, StoredTrip>();
  private nicknames = new Map<string, string>();
  private saved = new Set<string>();
  private savedIds = new Map<string, string>();
  private savedMeta = new Map<string, StoredSaved>();

  private savedKey(ownerId: string, sourceShareId: string): string {
    return `${ownerId}|${sourceShareId}`;
  }

  async create(input: NewTripInput): Promise<Trip> {
    const now = new Date().toISOString();
    const trip: StoredTrip = {
      id: crypto.randomUUID(),
      shareId: input.shareId,
      ownerId: input.ownerId,
      creatorId: input.ownerId,
      updaterId: input.ownerId,
      isDeleted: false,
      title: input.title ?? null,
      createdAt: now,
      updatedAt: now,
      data: input.data ?? { days: [], stops: [], segments: [] },
    };
    this.trips.set(trip.id, trip);
    return trip;
  }

  async getById(id: string): Promise<Trip | null> {
    const t = this.trips.get(id);
    return t && !t.isDeleted ? t : null;
  }

  async getByShareId(shareId: string): Promise<Trip | null> {
    for (const trip of this.trips.values()) {
      if (trip.shareId === shareId && !trip.isDeleted) return trip;
    }
    return null;
  }

  async update(
    id: string,
    ownerId: string,
    patch: { data?: TripData; title?: string; expectedUpdatedAt?: string },
  ): Promise<Trip | null> {
    const trip = this.trips.get(id);
    if (!trip || trip.ownerId !== ownerId || trip.isDeleted) return null;
    // 内存实现存 ISO 字符串，直接字符串比较；不匹配视为并发冲突，返回 null。
    if (patch.expectedUpdatedAt !== undefined && trip.updatedAt !== patch.expectedUpdatedAt) return null;
    const updated: StoredTrip = {
      ...trip,
      ...(patch.data !== undefined ? { data: patch.data } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      updaterId: ownerId,
      updatedAt: new Date().toISOString(),
    };
    this.trips.set(id, updated);
    return updated;
  }

  /** 逻辑删除：置 is_deleted 并级联逻辑删除收藏记录，与 Neon 对齐。 */
  async remove(id: string, ownerId: string): Promise<boolean> {
    const trip = this.trips.get(id);
    if (!trip || trip.ownerId !== ownerId || trip.isDeleted) return false;
    this.trips.set(id, { ...trip, isDeleted: true, updaterId: ownerId, updatedAt: new Date().toISOString() });
    for (const [key, sv] of this.savedMeta) {
      if (sv.tripId === id && !sv.isDeleted) {
        this.savedMeta.set(key, { ...sv, isDeleted: true, updaterId: ownerId });
      }
    }
    return true;
  }

  async listByOwner(ownerId: string, limit = 10): Promise<Trip[]> {
    return [...this.trips.values()]
      .filter((t) => t.ownerId === ownerId && !t.isDeleted)
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
    if (!this.savedIds.has(key)) {
      this.savedIds.set(key, tripId);
      this.savedMeta.set(key, {
        id: crypto.randomUUID(),
        ownerId,
        sourceShareId,
        tripId,
        creatorId: ownerId,
        updaterId: ownerId,
        isDeleted: false,
      });
    }
  }

  async getSavedTripId(ownerId: string, sourceShareId: string): Promise<string | null> {
    const key = this.savedKey(ownerId, sourceShareId);
    const meta = this.savedMeta.get(key);
    if (!meta || meta.isDeleted) return null;
    return this.savedIds.get(key) ?? null;
  }

  async claimTrips(fromOwnerId: string, toOwnerId: string): Promise<number> {
    if (fromOwnerId === toOwnerId) return 0;
    let count = 0;
    for (const [id, trip] of this.trips) {
      if (trip.ownerId === fromOwnerId && !trip.isDeleted) {
        this.trips.set(id, { ...trip, ownerId: toOwnerId, updaterId: toOwnerId, updatedAt: new Date().toISOString() });
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
