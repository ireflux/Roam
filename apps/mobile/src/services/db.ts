import * as SQLite from "expo-sqlite";
import type { Trip, TripData } from "@roam/core";

/** 本地行程镜像（spec §8.1）。读路径永远走本地；dirty 行由同步引擎推送。 */
interface TripRow {
  id: string;
  share_id: string | null;
  title: string | null;
  data: string;
  base_updated_at: string;
  dirty: number;
  deleted: number;
  created_at: number;
  updated_at: number;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function open(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("roam.db").then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS trips (
          id TEXT PRIMARY KEY NOT NULL,
          share_id TEXT,
          title TEXT,
          data TEXT NOT NULL,
          base_updated_at TEXT NOT NULL,
          dirty INTEGER NOT NULL DEFAULT 0,
          deleted INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS trips_updated_idx ON trips (updated_at DESC);
        CREATE TABLE IF NOT EXISTS sync_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      return db;
    });
  }
  return dbPromise;
}

function rowToTrip(row: TripRow): Trip {
  const parsed: unknown = JSON.parse(row.data);
  return {
    id: row.id,
    // 未同步过的行程没有服务端 shareId，用 id 兜底避免 UI 判空分支
    shareId: row.share_id ?? "",
    ownerId: "",
    title: row.title,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: row.base_updated_at,
    data: parsed as TripData,
  };
}

export const tripDb = {
  async upsertLocal(input: {
    id: string;
    shareId?: string | null;
    title?: string | null;
    data: TripData;
    baseUpdatedAt?: string;
    dirty?: boolean;
    deleted?: boolean;
  }): Promise<void> {
    const db = await open();
    await db.runAsync(
      `INSERT INTO trips (id, share_id, title, data, base_updated_at, dirty, deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         share_id = COALESCE(excluded.share_id, share_id),
         title = COALESCE(excluded.title, title),
         data = excluded.data,
         base_updated_at = COALESCE(excluded.base_updated_at, base_updated_at),
         dirty = excluded.dirty,
         deleted = excluded.deleted,
         updated_at = excluded.updated_at`,
      [
        input.id,
        input.shareId ?? null,
        input.title ?? null,
        JSON.stringify(input.data),
        input.baseUpdatedAt ?? new Date(0).toISOString(),
        input.dirty === false ? 0 : 1,
        input.deleted ? 1 : 0,
        Date.now(),
        Date.now(),
      ],
    );
  },

  async get(id: string): Promise<Trip | null> {
    const db = await open();
    const row = await db.getFirstAsync<TripRow>(`SELECT * FROM trips WHERE id = ? AND deleted = 0`, [id]);
    return row ? rowToTrip(row) : null;
  },

  /** 首页列表：未删除、按本地修改时间倒序。 */
  async list(limit = 50): Promise<Trip[]> {
    const db = await open();
    const rows = await db.getAllAsync<TripRow>(
      `SELECT * FROM trips WHERE deleted = 0 ORDER BY updated_at DESC LIMIT ?`,
      [limit],
    );
    return rows.map(rowToTrip);
  },

  /** 软删：立即从列表消失；tombstone 由同步引擎广播服务端。 */
  async softDelete(id: string): Promise<void> {
    const db = await open();
    await db.runAsync(`UPDATE trips SET deleted = 1, dirty = 1, updated_at = ? WHERE id = ?`, [
      Date.now(),
      id,
    ]);
  },

  /** 取待推送的 dirty 行（deleted 与否皆含），按更新时间升序保证旧变更先推。 */
  async takeDirty(limit = 10): Promise<Array<{ id: string; title: string | null; data: TripData; baseUpdatedAt: string; deleted: boolean }>> {
    const db = await open();
    const rows = await db.getAllAsync<TripRow>(
      `SELECT * FROM trips WHERE dirty = 1 ORDER BY updated_at ASC LIMIT ?`,
      [limit],
    );
    return rows.map((row) => {
      const parsed: unknown = JSON.parse(row.data);
      return {
        id: row.id,
        title: row.title,
        data: parsed as TripData,
        baseUpdatedAt: row.base_updated_at,
        deleted: row.deleted === 1,
      };
    });
  },

  /** 推送成功：清脏标记、推进乐观并发基准、回填服务端生成的 shareId。 */
  async markSynced(id: string, serverUpdatedAt: string, shareId?: string): Promise<void> {
    const db = await open();
    if (shareId) {
      await db.runAsync(`UPDATE trips SET dirty = 0, base_updated_at = ?, share_id = ? WHERE id = ?`, [
        serverUpdatedAt,
        shareId,
        id,
      ]);
    } else {
      await db.runAsync(`UPDATE trips SET dirty = 0, base_updated_at = ? WHERE id = ?`, [serverUpdatedAt, id]);
    }
  },

  async markSyncFailed(id: string): Promise<void> {
    const db = await open();
    await db.runAsync(`UPDATE trips SET dirty = 1, updated_at = ? WHERE id = ?`, [Date.now(), id]);
  },

  async getMeta(key: string): Promise<string | null> {
    const db = await open();
    const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM sync_meta WHERE key = ?`, [key]);
    return row?.value ?? null;
  },

  async setMeta(key: string, value: string): Promise<void> {
    const db = await open();
    await db.runAsync(
      `INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  },
};
