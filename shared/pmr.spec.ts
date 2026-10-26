import { describe, it, expect } from "vitest";

import {
  locationGate,
  captureTimeGate,
  quality,
  defaultPolicy,
  evidenceDecision,
  hashDistance,
} from "./pmr";
describe("PMR evidence gates", () => {
  const now = Date.parse("2026-10-26T10:00:00Z"),
    site = { latitude: 24.7, longitude: 46.7 };
  it("requires fresh accurate GPS reliably within the boundary", () => {
    const fix = {
      ...site,
      accuracy: 10,
      timestamp: new Date(now).toISOString(),
    };
    expect(locationGate(fix, site, now).allowed).toBe(true);
    expect(locationGate({ ...fix, latitude: 24.71 }, site, now).allowed).toBe(
      false,
    );
    expect(locationGate({ ...fix, accuracy: 90 }, site, now).allowed).toBe(
      false,
    );
    expect(
      locationGate(
        { ...fix, timestamp: new Date(now - 180000).toISOString() },
        site,
        now,
      ).allowed,
    ).toBe(false);
  });
  it("judges original capture time, allowing delayed offline upload", () => {
    expect(
      captureTimeGate(
        "2026-10-26T10:00:00Z",
        "2026-10-26T09:00:00Z",
        "2026-10-26T11:00:00Z",
        "2026-10-27T10:00:00Z",
      ),
    ).toBeNull();
    expect(
      captureTimeGate(
        "2026-10-26T12:00:00Z",
        "2026-10-26T09:00:00Z",
        "2026-10-26T11:00:00Z",
        "2026-10-27T10:00:00Z",
      ),
    ).toContain("TCN");
  });
  it("never gives missing analysis full marks or bypasses a blocking finding", () => {
    const q = quality(
      {
        clarity: 100,
        coverage: null,
        integrity: 100,
        location: 100,
        time: 100,
      },
      defaultPolicy,
    );
    expect(q.score).toBe(75);
    expect(q.provisional).toBe(true);
    expect(
      evidenceDecision(
        [
          {
            code: "mismatch",
            message: "Wrong equipment",
            severity: "block",
            confidence: 1,
          },
        ],
        true,
      ),
    ).toBe("Retake required");
    expect(evidenceDecision([], false)).toBe("Pending analysis");
  });
  it("compares perceptual hashes", () => {
    expect(hashDistance("ff", "ff")).toBe(0);
    expect(hashDistance("ff", "fe")).toBe(1);
  });
});
