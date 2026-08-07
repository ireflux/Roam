import "server-only";
import type { RouteResult } from "@/lib/routing/provider";
import type { Mode, Position } from "@/lib/types";

interface CacheEntry {
  result: RouteResult;
  ts: number;
}

const TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_ENTRIES = 500;

const store = new Map<string, CacheEntry>();

function keyOf(mode: Mode, from: Position, to: Position): string {
  return `${mode}|${from[0].toFixed(5)},${from[1].toFixed(5)}|${to[0].toFixed(5)},${to[1].toFixed(5)}`;
}

export function getCachedRoute(mode: Mode, from: Position, to: Position): RouteResult | null {
  const entry = store.get(keyOf(mode, from, to));
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    store.delete(keyOf(mode, from, to));
    return null;
  }
  return entry.result;
}

/**
 * 进程内 Map 缓存：单实例有效，Serverless 多实例下命中率有限（未来可迁移
 * 到 route_cache 表或 Redis）。淘汰为真 LRU：set 前先 delete 刷新插入顺序，
 * keys().next() 即最久未使用。
 */
export function setCachedRoute(mode: Mode, from: Position, to: Position, result: RouteResult): void {
  const key = keyOf(mode, from, to);
  store.delete(key);
  store.set(key, { result, ts: Date.now() });
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value as string;
    store.delete(oldest);
  }
}
