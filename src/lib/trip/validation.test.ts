import { describe, expect, it } from "vitest";
import { isTripData } from "@/lib/trip/validation";

const valid = { days: [{ id: "day-1" }], stops: [{ id: "stop-1", dayId: "day-1", name: "外滩", lat: 31.24, lng: 121.49, order: 0 }], segments: [] };

describe("isTripData", () => {
  it("accepts a bounded valid trip", () => expect(isTripData(valid)).toBe(true));
  it("rejects invalid coordinates", () => expect(isTripData({ ...valid, stops: [{ ...valid.stops[0], lat: 100 }] })).toBe(false));
  it("rejects malformed segment geometry", () => expect(isTripData({ ...valid, segments: [{ id: "s", fromStop: "a", toStop: "b", mode: "driving", kind: "auto", geometry: { type: "LineString", coordinates: [[1, 2]] } }] })).toBe(false));
});
