import { describe, expect, it } from "vitest";

import { checklists } from "./checklists";
import {
  captureTimeGate,
  defaultPolicy,
  hashDistance,
  locationGate,
  type Geo,
} from "./pmr";

const site = { latitude: 24.7, longitude: 46.7 };
const now = Date.parse("2026-10-27T06:10:00.000Z");

function fix(overrides: Partial<Geo> = {}): Geo {
  return {
    latitude: site.latitude,
    longitude: site.longitude,
    accuracy: 10,
    timestamp: "2026-10-27T06:10:00.000Z",
    ...overrides,
  };
}

describe("ETL catalog", () => {
  const etls = (type: "ODU" | "SHELTER") =>
    checklists[type].flatMap((group) => group.etls);

  it("keeps the full reference catalog", () => {
    expect(checklists.ODU).toHaveLength(15);
    expect(checklists.SHELTER).toHaveLength(28);
    expect(etls("ODU")).toHaveLength(67);
    expect(etls("SHELTER")).toHaveLength(144);
  });

  it("flags the seven entries that need clarification", () => {
    const flagged = [...etls("ODU"), ...etls("SHELTER")].filter(
      (etl) => etl.requiresClarification,
    );
    expect(flagged).toHaveLength(7);
  });
});

describe("locationGate", () => {
  it("allows a fresh, accurate fix inside the radius", () => {
    expect(locationGate(fix(), site, now).allowed).toBe(true);
  });

  it("blocks a stale fix", () => {
    const result = locationGate(
      fix({ timestamp: "2026-10-27T06:00:00.000Z" }),
      site,
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/stale/);
  });

  it("blocks low accuracy", () => {
    const result = locationGate(
      fix({ accuracy: defaultPolicy.maxAccuracy + 1 }),
      site,
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/accuracy/);
  });

  it("blocks a fix outside the boundary once accuracy is counted", () => {
    const far = fix({ latitude: site.latitude + 0.0022, accuracy: 40 });
    const result = locationGate(far, site, now);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/250 m/);
  });

  it("blocks capture when the site has no coordinates", () => {
    const result = locationGate(fix(), { latitude: null, longitude: null }, now);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/coordinates are missing/);
  });
});

describe("captureTimeGate", () => {
  const start = "2026-10-27T06:00:00.000Z";
  const end = "2026-10-27T10:00:00.000Z";

  it("accepts a capture inside the TCN window", () => {
    expect(
      captureTimeGate(
        "2026-10-27T07:00:00.000Z",
        start,
        end,
        "2026-10-27T07:00:05.000Z",
      ),
    ).toBeNull();
  });

  it("rejects a capture outside the TCN window", () => {
    expect(
      captureTimeGate(
        "2026-10-27T11:00:00.000Z",
        start,
        end,
        "2026-10-27T11:00:05.000Z",
      ),
    ).toMatch(/TCN/);
  });

  it("rejects future timestamps and invalid values", () => {
    expect(
      captureTimeGate(
        "2026-10-27T09:00:00.000Z",
        start,
        end,
        "2026-10-27T07:00:00.000Z",
      ),
    ).toMatch(/future/);
    expect(
      captureTimeGate("not-a-date", start, end, "2026-10-27T07:00:00.000Z"),
    ).toMatch(/invalid/);
  });
});

describe("hashDistance", () => {
  it("counts differing bits and treats length mismatch as maximal", () => {
    expect(hashDistance("0", "0")).toBe(0);
    expect(hashDistance("f", "0")).toBe(4);
    expect(hashDistance("ff", "f")).toBe(64);
  });
});
