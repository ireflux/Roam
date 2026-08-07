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

  it("setNickname / getNickname 往返", async () => {
    const repo = makeRepo();
    expect(await repo.getNickname("o1")).toBeNull();
    await repo.setNickname("o1", "小明");
    expect(await repo.getNickname("o1")).toBe("小明");
  });
});
