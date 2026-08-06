import type { NewTripInput, Trip } from "@/lib/types";
import { toTrip, type TripRepo } from "@/lib/db/repo";

export class MemoryTripRepo implements TripRepo {
  private trips = new Map<string, Trip>();
  private nicknames = new Map<string, string>();

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
    patch: { data?: unknown; title?: string },
  ): Promise<Trip | null> {
    const trip = this.trips.get(id);
    if (!trip || trip.ownerId !== ownerId) return null;
    const updated: Trip = {
      ...trip,
      ...(patch.data !== undefined ? { data: patch.data as Trip["data"] } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.trips.set(id, updated);
    return updated;
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
}
