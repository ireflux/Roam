import { describe, expect, it } from "vitest";
import { isTripData } from "./validation";

const valid = { days: [{ id: "day-1" }], stops: [{ id: "stop-1", dayId: "day-1", name: "外滩", lat: 31.24, lng: 121.49, order: 0 }], segments: [] };
const validSegment = { id: "s", fromStop: "a", toStop: "b", mode: "driving", kind: "auto", geometry: { type: "LineString", coordinates: [[1, 2], [3, 4]] } };

describe("isTripData", () => {
  it("accepts a bounded valid trip", () => expect(isTripData(valid)).toBe(true));
  it("rejects invalid coordinates", () => expect(isTripData({ ...valid, stops: [{ ...valid.stops[0], lat: 100 }] })).toBe(false));
  it("rejects malformed segment geometry", () => expect(isTripData({ ...valid, segments: [{ id: "s", fromStop: "a", toStop: "b", mode: "driving", kind: "auto", geometry: { type: "LineString", coordinates: [[1, 2]] } }] })).toBe(false));
  it("accepts degraded flag", () => expect(isTripData({ ...valid, segments: [{ ...validSegment, degraded: true }] })).toBe(true));
  it("rejects non-boolean degraded", () => expect(isTripData({ ...valid, segments: [{ ...validSegment, degraded: "yes" }] })).toBe(false));

  it("accepts 30 days", () => {
    const days = Array.from({ length: 30 }, (_, i) => ({ id: `day-${i}` }));
    expect(isTripData({ ...valid, days })).toBe(true);
  });
  it("rejects 31 days", () => {
    const days = Array.from({ length: 31 }, (_, i) => ({ id: `day-${i}` }));
    expect(isTripData({ ...valid, days })).toBe(false);
  });
  it("accepts 100 segments", () => {
    const segments = Array.from({ length: 100 }, (_, i) => ({ ...validSegment, id: `s${i}` }));
    expect(isTripData({ ...valid, segments })).toBe(true);
  });
  it("rejects 101 segments", () => {
    const segments = Array.from({ length: 101 }, (_, i) => ({ ...validSegment, id: `s${i}` }));
    expect(isTripData({ ...valid, segments })).toBe(false);
  });
  it("rejects 2501 points in a segment", () => {
    const coords = Array.from({ length: 2_501 }, (_, i) => [i % 180, i % 90] as [number, number]);
    expect(isTripData({ ...valid, segments: [{ ...validSegment, geometry: { type: "LineString", coordinates: coords } }] })).toBe(false);
  });
  it("rejects 2501 points in a part", () => {
    const coords = Array.from({ length: 2_501 }, (_, i) => [i % 180, i % 90] as [number, number]);
    expect(isTripData({ ...valid, segments: [{ ...validSegment, parts: [{ kind: "transit", coordinates: coords }] }] })).toBe(false);
  });
});
