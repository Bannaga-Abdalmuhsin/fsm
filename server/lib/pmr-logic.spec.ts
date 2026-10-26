import { describe, expect, it } from "vitest";

import { detectImageType } from "./private-photos";
import { SHELTER_GROUPS, verifyEtlMapping } from "./etl-templates";
import { SHELTER_SOURCE_ROWS } from "./shelter-checklist-source";
import {
  DEFAULT_SCORING_POLICY,
  aggregateWorkOrderScore,
  scoreEvidence,
  validatePolicy,
} from "./scoring";

const full = { clarity: 1, requiredDetail: 1, integrity: 1, location: 1, time: 1 };

describe("evidence scoring", () => {
  it("passes only when every dimension is evaluated and no gate blocks", () => {
    const score = scoreEvidence({ dimensions: full, pending: false, hardGates: [] });
    expect(score.total).toBe(100);
    expect(score.band).toBe("pass");
    expect(score.provisional).toBe(false);
  });

  it("gives zero points for unevaluated dimensions instead of full points", () => {
    const score = scoreEvidence({
      dimensions: { ...full, clarity: null },
      pending: false,
      hardGates: [],
    });
    expect(score.total).toBe(75);
    expect(score.breakdown.clarity.evaluated).toBe(false);
    expect(score.provisional).toBe(true);
  });

  it("keeps pending evidence provisional and never a pass", () => {
    const score = scoreEvidence({ dimensions: full, pending: true, hardGates: [] });
    expect(score.band).toBe("pending");
    expect(score.provisional).toBe(true);
  });

  it("lets a hard gate override a perfect score", () => {
    const score = scoreEvidence({
      dimensions: full,
      pending: false,
      hardGates: ["wrong_equipment"],
    });
    expect(score.total).toBe(100);
    expect(score.band).toBe("blocked");
  });

  it("bands 75-89 as review and below 75 as retake", () => {
    const review = scoreEvidence({
      dimensions: { ...full, clarity: 0.2 },
      pending: false,
      hardGates: [],
    });
    expect(review.total).toBe(80);
    expect(review.band).toBe("review");
    const retake = scoreEvidence({
      dimensions: { clarity: 0.2, requiredDetail: 0.2, integrity: 0.2, location: 0.2, time: 0.2 },
      pending: false,
      hardGates: [],
    });
    expect(retake.band).toBe("retake");
  });

  it("validates the default policy and rejects bad weights", () => {
    expect(validatePolicy(DEFAULT_SCORING_POLICY)).toEqual([]);
    expect(
      validatePolicy({ ...DEFAULT_SCORING_POLICY, weights: { ...DEFAULT_SCORING_POLICY.weights, clarity: 30 } }),
    ).not.toEqual([]);
  });

  it("counts a missing required slot as zero and ignores extra photos", () => {
    const pass = scoreEvidence({ dimensions: full, pending: false, hardGates: [] });
    const agg = aggregateWorkOrderScore([
      { required: true, score: pass },
      { required: true, score: null },
      { required: false, score: pass },
    ]);
    expect(agg.percent).toBe(50);
    expect(agg.missingRequired).toBe(1);
  });
});

describe("ETL mapping and Shelter source", () => {
  it("maps every ODU and Shelter suffix exactly once", () => {
    expect(verifyEtlMapping()).toEqual([]);
  });

  it("has 28 Shelter groups", () => {
    expect(SHELTER_GROUPS).toHaveLength(28);
  });

  it("imports all 144 Shelter rows with original identifiers", () => {
    expect(SHELTER_SOURCE_ROWS).toHaveLength(144);
    expect(SHELTER_SOURCE_ROWS[0].originalId).toBe("COW_MONTHLY_ONSITE_1");
    expect(SHELTER_SOURCE_ROWS[143].originalId).toBe("COW_MONTHLY_144");
    const suffixes = new Set(SHELTER_SOURCE_ROWS.map((r) => r.suffix));
    expect(suffixes.size).toBe(144);
  });

  it("flags the visibly truncated Shelter descriptions", () => {
    const flagged = SHELTER_SOURCE_ROWS.filter((r) => r.wordingStatus !== "complete").map(
      (r) => r.suffix,
    );
    expect(flagged).toEqual([32, 75, 79, 113, 121]);
  });
});

describe("photo type detection", () => {
  it("recognises JPEG, PNG and WebP by magic bytes", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mimeType).toBe("image/jpeg");
    expect(
      detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))?.mimeType,
    ).toBe("image/png");
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageType(webp)?.mimeType).toBe("image/webp");
  });

  it("rejects non-image bytes", () => {
    expect(detectImageType(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toBeNull();
  });
});
