import "server-only";
import { NeonTripRepo } from "@/lib/db/neon";
import { MemoryTripRepo } from "@/lib/db/memory";
import type { TripRepo } from "@/lib/db/repo";

let repo: TripRepo | null = null;

export function getRepo(): TripRepo {
  if (!repo) {
    const url = process.env.DATABASE_URL;
    repo = url ? new NeonTripRepo(url) : new MemoryTripRepo();
  }
  return repo;
}

export function isMemoryRepo(): boolean {
  return !process.env.DATABASE_URL;
}