import { describe, expect, it } from "vitest";
import { MemoryTripRepo } from "@/lib/db/memory";

function makeRepo() {
  return new MemoryTripRepo();
}

describe("MemoryTripRepo", () => {
  it("create / getById / getByShareId 往返", async () => {
    const repo = makeRepo();
    const trip = await repo.create({ ownerId: "o1", shareId: "abc123XYZ", title: "t" });
    expect(await repo.getById(trip.id)).toMatchObject({ ownerId: "o1", title: "t" });
    expect((await repo.getByShareId("abc123XYZ"))?.id).toBe(trip.id);
    expect(await repo.getByShareId("missing")).toBeNull();
  });

  it("remove 仅允许 owner 删除", async () => {
    const repo = makeRepo();
    const trip = await repo.create({ ownerId: "o1", shareId: "abc123XYZ" });
    expect(await repo.remove(trip.id, "o2")).toBe(false);
    expect(await repo.getById(trip.id)).not.toBeNull();
    expect(await repo.remove(trip.id, "o1")).toBe(true);
    expect(await repo.getById(trip.id)).toBeNull();
    expect(await repo.getByShareId("abc123XYZ")).toBeNull();
  });

  it("remove 不存在的行程返回 false", async () => {
    const repo = makeRepo();
    expect(await repo.remove("missing", "o1")).toBe(false);
  });

  it("remove 为逻辑删除：列表与认领不再可见，收藏被级联软删", async () => {
    const repo = makeRepo();
    const trip = await repo.create({ ownerId: "o1", shareId: "abc123XYZ" });
    await repo.create({ ownerId: "o1", shareId: "other1" });
    await repo.saveSharedTrip("u9", "abc123XYZ", trip.id);
    expect(await repo.getSavedTripId("u9", "abc123XYZ")).toBe(trip.id);

    expect(await repo.remove(trip.id, "o1")).toBe(true);
    expect(await repo.getById(trip.id)).toBeNull();
    expect(await repo.getByShareId("abc123XYZ")).toBeNull();
    expect((await repo.listByOwner("o1", 10)).map((t) => t.shareId)).toEqual(["other1"]);
    expect(await repo.getSavedTripId("u9", "abc123XYZ")).toBeNull();
  });

  it("claimTrips 跳过已逻辑删除的行程", async () => {
    const repo = makeRepo();
    const deleted = await repo.create({ ownerId: "anon-123", shareId: "s1" });
    await repo.create({ ownerId: "anon-123", shareId: "s2" });
    await repo.remove(deleted.id, "anon-123");
    expect(await repo.claimTrips("anon-123", "u1")).toBe(1);
  });

  it("setNickname / getNickname 往返", async () => {
    const repo = makeRepo();
    expect(await repo.getNickname("o1")).toBeNull();
    await repo.setNickname("o1", "小明");
    expect(await repo.getNickname("o1")).toBe("小明");
  });
});

describe("MemoryTripRepo 功能三：收藏 / 认领", () => {
  const makeRepo = () => new MemoryTripRepo();

  it("saveSharedTrip 去重 + getSavedTripId 往返", async () => {
    const repo = makeRepo();
    expect(await repo.getSavedTripId("u1", "shareA")).toBeNull();
    await repo.saveSharedTrip("u1", "shareA", "trip-1");
    await repo.saveSharedTrip("u1", "shareA", "trip-2");
    expect(await repo.getSavedTripId("u1", "shareA")).toBe("trip-1");
    expect(await repo.getSavedTripId("u1", "shareB")).toBeNull();
    expect(await repo.getSavedTripId("u2", "shareA")).toBeNull();
  });

  it("claimTrips 过户匿名行程，同 owner 幂等", async () => {
    const repo = makeRepo();
    await repo.create({ ownerId: "anon-123", shareId: "s1" });
    await repo.create({ ownerId: "anon-123", shareId: "s2" });
    await repo.create({ ownerId: "u1", shareId: "s3" });
    expect(await repo.claimTrips("anon-123", "u1")).toBe(2);
    expect(await repo.claimTrips("anon-123", "u1")).toBe(0);
    const owned = await repo.listByOwner("u1", 10);
    expect(owned.map((t) => t.shareId).sort()).toEqual(["s1", "s2", "s3"]);
  });

  it("claimProfile 迁移匿名昵称（防主键冲突删旧行）", async () => {
    const repo = makeRepo();
    await repo.setNickname("anon-456", "游客甲");
    await repo.setNickname("u2", "旧名");
    await repo.claimProfile("anon-456", "u2");
    expect(await repo.getNickname("anon-456")).toBeNull();
    expect(await repo.getNickname("u2")).toBe("游客甲");
  });
});
