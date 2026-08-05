import "server-only";
import { NeonTripRepo } from "@/lib/db/neon";
import { MemoryTripRepo } from "@/lib/db/memory";
import type { TripRepo } from "@/lib/db/repo";

let repo: TripRepo | null = null;

export function getRepo(): TripRepo {
  if (!repo) {
    const url = process.env.DATABASE_URL;
    if (!url && process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL must be configured in production");
    }
    repo = url ? new NeonTripRepo(url) : new MemoryTripRepo();
  }
  return repo;
}

export function isMemoryRepo(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}
