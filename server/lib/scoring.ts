export const DEFAULT_SCORING_POLICY = {
  version: "pmr-scoring-v1",
  weights: { clarity: 25, requiredDetail: 25, integrity: 20, location: 15, time: 15 },
  passAt: 90,
  reviewAt: 75,
} as const;

export type ScoringPolicy = {
  version: string;
  weights: Record<keyof typeof DEFAULT_SCORING_POLICY.weights, number>;
  passAt: number;
  reviewAt: number;
};

export type DimensionKey = keyof ScoringPolicy["weights"];

export type EvidenceBand = "pass" | "review" | "retake" | "pending" | "blocked";

export interface EvidenceScoreInput {
  /** Each dimension is a 0..1 fraction, or null when it was not evaluated. */
  dimensions: Partial<Record<DimensionKey, number | null>>;
  pending: boolean;
  hardGates: string[];
}

export interface EvidenceScore {
  policyVersion: string;
  total: number;
  provisional: boolean;
  band: EvidenceBand;
  breakdown: Record<DimensionKey, { points: number; max: number; evaluated: boolean }>;
  blockedBy: string[];
}

export function validatePolicy(policy: ScoringPolicy): string[] {
  const problems: string[] = [];
  const sum = Object.values(policy.weights).reduce((a, b) => a + b, 0);
  if (sum !== 100) problems.push(`weights sum to ${sum}, expected 100`);
  for (const [key, value] of Object.entries(policy.weights)) {
    if (!Number.isFinite(value) || value < 0) problems.push(`${key} weight invalid`);
  }
  if (!(policy.reviewAt > 0 && policy.reviewAt < policy.passAt && policy.passAt <= 100)) {
    problems.push("thresholds must satisfy 0 < reviewAt < passAt <= 100");
  }
  return problems;
}

export function scoreEvidence(
  input: EvidenceScoreInput,
  policy: ScoringPolicy = DEFAULT_SCORING_POLICY,
): EvidenceScore {
  const keys = Object.keys(policy.weights) as DimensionKey[];
  const breakdown = {} as EvidenceScore["breakdown"];
  let total = 0;
  for (const key of keys) {
    const max = policy.weights[key];
    const raw = input.dimensions[key];
    const evaluated = typeof raw === "number" && Number.isFinite(raw);
    const fraction = evaluated ? Math.min(1, Math.max(0, raw)) : 0;
    const points = Math.round(fraction * max * 100) / 100;
    breakdown[key] = { points, max, evaluated };
    total += points;
  }
  total = Math.round(total * 100) / 100;

  let band: EvidenceBand;
  if (input.hardGates.length > 0) band = "blocked";
  else if (input.pending) band = "pending";
  else if (total >= policy.passAt) band = "pass";
  else if (total >= policy.reviewAt) band = "review";
  else band = "retake";

  return {
    policyVersion: policy.version,
    total,
    provisional: input.pending || keys.some((k) => !breakdown[k].evaluated),
    band,
    breakdown,
    blockedBy: input.hardGates,
  };
}

export interface RequiredSlotScore {
  required: boolean;
  score: EvidenceScore | null;
}

export function aggregateWorkOrderScore(slots: RequiredSlotScore[]) {
  const required = slots.filter((s) => s.required);
  if (required.length === 0) return { percent: 0, missingRequired: 0, slotCount: 0 };
  const sum = required.reduce((acc, slot) => {
    if (!slot.score || slot.score.band === "blocked") return acc;
    return acc + slot.score.total;
  }, 0);
  const missingRequired = required.filter((s) => !s.score).length;
  return {
    percent: Math.round((sum / (required.length * 100)) * 1000) / 10,
    missingRequired,
    slotCount: required.length,
  };
}
