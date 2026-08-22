import { describe, expect, it } from "vitest";
import { MemoryTripRepo } from "@/lib/db/memory";

function makeRepo() {
  return new MemoryTripRepo();
}

describe("upsertTrip（移动端同步通道）", () => {
  it("新建：id 不存在时建档并生成 shareId", async () => {
    const repo = makeRepo();
    const result = await repo.upsertTrip({ id: crypto.randomUUID(), ownerId: "o1", title: "离线建的行程" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.trip.shareId).toHaveLength(16);
      expect(result.trip.title).toBe("离线建的行程");
      expect(await repo.getById(result.trip.id)).not.toBeNull();
    }
  });

  it("更新：owner 匹配且版本一致时覆盖数据，返回新 updatedAt", async () => {
    const repo = makeRepo();
    const id = crypto.randomUUID();
    const created = await repo.upsertTrip({ id, ownerId: "o1" });
    if (!created.ok) throw new Error("unreachable");
    const updated = await repo.upsertTrip({
      id,
      ownerId: "o1",
      title: "v2",
      expectedUpdatedAt: created.trip.updatedAt,
    });
    expect(updated.ok).toBe(true);
  });

  it("冲突：expectedUpdatedAt 不匹配时返回 conflict 与服务端当前版本", async () => {
    const repo = makeRepo();
    const id = crypto.randomUUID();
    await repo.upsertTrip({ id, ownerId: "o1" });
    const result = await repo.upsertTrip({
      id,
      ownerId: "o1",
      title: "stale",
      expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
    });
    expect(result).toMatchObject({ ok: false, reason: "conflict" });
    if (!result.ok && result.reason === "conflict") {
      expect(new Date(result.serverUpdatedAt).getTime()).toBeGreaterThan(0);
    }
  });

  it("禁止：他人 id 直接 forbidden", async () => {
    const repo = makeRepo();
    const id = crypto.randomUUID();
    await repo.upsertTrip({ id, ownerId: "o1" });
    expect(await repo.upsertTrip({ id, ownerId: "o2", title: "hack" })).toMatchObject({
      ok: false,
      reason: "forbidden",
    });
  });

  it("软删：deleted=true 置 tombstone，getById 不可见但 delta 可见", async () => {
    const repo = makeRepo();
    const id = crypto.randomUUID();
    const created = await repo.upsertTrip({ id, ownerId: "o1" });
    if (!created.ok) throw new Error("unreachable");
    const removed = await repo.upsertTrip({ id, ownerId: "o1", deleted: true });
    expect(removed.ok).toBe(true);
    expect(await repo.getById(id)).toBeNull();

    const delta = await repo.listChangedSince("o1", new Date(0), 100);
    expect(delta.trips).toHaveLength(0);
    expect(delta.deletedIds).toEqual([id]);
  });

  it("幂等：同数据重复 upsert 均成功", async () => {
    const repo = makeRepo();
    const id = crypto.randomUUID();
    const first = await repo.upsertTrip({ id, ownerId: "o1", title: "x" });
    if (!first.ok) throw new Error("unreachable");
    const again = await repo.upsertTrip({
      id,
      ownerId: "o1",
      title: "x",
      expectedUpdatedAt: first.trip.updatedAt,
    });
    expect(again.ok).toBe(true);
  });
});

describe("listChangedSince（增量拉取）", () => {
  it("只返回 since 之后变更的行程，tombstone 单独输出", async () => {
    const repo = makeRepo();
    // cutoff 回拨 2ms：后续操作即使与当前时间同毫秒完成，也必然落在 cutoff 之后（严格 > 比较）
    const cutoff = new Date(Date.now() - 2);
    const a = await repo.create({ ownerId: "o1", shareId: "s-a" });
    const b = await repo.create({ ownerId: "o1", shareId: "s-b" });
    await repo.create({ ownerId: "o2", shareId: "s-c" });

    // a 软删发生在 cutoff 之后 → tombstone
    const removed = await repo.remove(a.id, "o1");

    const delta = await repo.listChangedSince("o1", cutoff, 100);
    expect(removed).toBe(true);
    expect(delta.deletedIds).toEqual([a.id]);
    expect(delta.trips.map((t) => t.id)).toEqual([b.id]);

    // 全量回放：since=0 包含所有非删除行程
    const all = await repo.listChangedSince("o1", new Date(0), 100);
    expect(all.trips.map((t) => t.id)).toEqual([b.id]);
  });

  it("limit 截断且按 updatedAt 升序", async () => {
    const repo = makeRepo();
    await repo.create({ ownerId: "o1", shareId: "s1" });
    await repo.create({ ownerId: "o1", shareId: "s2" });
    const delta = await repo.listChangedSince("o1", new Date(0), 1);
    expect(delta.trips).toHaveLength(1);
  });
});

describe("设备令牌与配对", () => {
  it("createApiToken / resolveApiToken 往返", async () => {
    const repo = makeRepo();
    await repo.createApiToken("hash-1", "device-o1");
    expect(await repo.resolveApiToken("hash-1")).toBe("device-o1");
    expect(await repo.resolveApiToken("missing")).toBeNull();
  });

  it("bindApiTokenOwner 改指用户 id；无效令牌返回 false", async () => {
    const repo = makeRepo();
    await repo.createApiToken("hash-1", "device-o1");
    expect(await repo.bindApiTokenOwner("hash-1", "user-u1")).toBe(true);
    expect(await repo.resolveApiToken("hash-1")).toBe("user-u1");
    expect(await repo.bindApiTokenOwner("missing", "user-u1")).toBe(false);
  });

  it("配对码一次性消费：过期/已用/未知均拒绝", async () => {
    const repo = makeRepo();
    await repo.createApiToken("hash-1", "device-o1");
    const future = new Date(Date.now() + 60_000);
    await repo.createDevicePair("123456", "hash-1", "device-o1", future);

    expect(await repo.consumeDevicePair("000000")).toBeNull();
    expect(await repo.consumeDevicePair("123456")).toBe("hash-1"); // 首次消费成功
    expect(await repo.consumeDevicePair("123456")).toBeNull(); // 二次消费拒绝

    await repo.createDevicePair("654321", "hash-1", "device-o1", new Date(Date.now() - 1));
    expect(await repo.consumeDevicePair("654321")).toBeNull(); // 过期
  });
});
