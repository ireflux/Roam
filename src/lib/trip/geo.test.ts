import { describe, expect, it } from "vitest";
import { roughDistanceM, simplifyLine, simplifyVertexIndices, uniformSample } from "@/lib/trip/geo";
import type { Position } from "@/lib/types";

describe("simplifyVertexIndices", () => {
  it("超出容量时均匀采样并保留首尾", () => {
    const idx = simplifyVertexIndices(100, 10);
    expect(idx).toHaveLength(10);
    expect(idx[0]).toBe(0);
    expect(idx[9]).toBe(99);
    expect(idx).toEqual([0, 11, 22, 33, 44, 55, 66, 77, 88, 99]);
  });

  it("容量内原样返回", () => {
    expect(simplifyVertexIndices(5, 10)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("uniformSample", () => {
  it("保留首尾且数量不超过上限", () => {
    const coords: Position[] = Array.from({ length: 50 }, (_, i) => [i, i]);
    const out = uniformSample(coords, 10);
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual([0, 0]);
    expect(out[9]).toEqual([49, 49]);
  });
});

describe("simplifyLine", () => {
  it("共线点被压缩到两个端点", () => {
    const coords: Position[] = Array.from({ length: 100 }, (_, i) => [i * 0.001, 0]);
    const out = simplifyLine(coords, { toleranceM: 10 });
    expect(out).toHaveLength(2);
  });

  it("折线保留转折点", () => {
    const coords: Position[] = [[0, 0], [0.001, 0.001], [0.002, 0], [0.003, 0.001], [0.004, 0]];
    const out = simplifyLine(coords, { toleranceM: 1 });
    expect(out.length).toBeGreaterThanOrEqual(3);
  });

  it("空/短输入安全", () => {
    expect(simplifyLine([])).toEqual([]);
    expect(simplifyLine([[1, 2], [3, 4]])).toEqual([[1, 2], [3, 4]]);
  });
});

describe("roughDistanceM", () => {
  it("已知距离", () => {
    const d = roughDistanceM([104.1954, 35.8617], [104.1954, 35.8717]);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1200);
  });
});
