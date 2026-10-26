import { z } from "zod";
export const regionSchema = z.enum(["CR", "ER", "WR", "SR"]);
export const siteTypeSchema = z.enum(["ODU", "SHELTER"]);
export const geoSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().positive().max(10000),
  timestamp: z.string().datetime({ offset: true }),
});
export type Geo = z.infer<typeof geoSchema>;
export type SiteType = z.infer<typeof siteTypeSchema>;
export type EtlStatus =
  | "Incomplete"
  | "Pass"
  | "Fail"
  | "Not applicable"
  | "Not tested";
export type EvidenceState =
  | "Pending analysis"
  | "Retake required"
  | "Supervisor review"
  | "Accepted";
export const dimensions = [
  "clarity",
  "coverage",
  "integrity",
  "location",
  "time",
] as const;
export type Dimension = (typeof dimensions)[number];
export const defaultPolicy = {
  version: 1,
  weights: { clarity: 25, coverage: 25, integrity: 20, location: 15, time: 15 },
  pass: 90,
  review: 75,
  radius: 250,
  maxAccuracy: 50,
  maxFixAgeSeconds: 120,
  timeToleranceSeconds: 120,
  nearDuplicateDistance: 4,
};
export type Policy = typeof defaultPolicy;
export type Finding = {
  code: string;
  message: string;
  severity: "block" | "review";
  confidence: number;
  etls?: number[];
  box?: number[];
};
export type Quality = {
  score: number | null;
  provisional: boolean;
  dimensions: Record<Dimension, number | null>;
};
export function quality(
  scores: Record<Dimension, number | null>,
  policy: Policy,
): Quality {
  let numerator = 0,
    denominator = 0;
  for (const key of dimensions) {
    denominator += policy.weights[key];
    numerator += (scores[key] ?? 0) * policy.weights[key];
  }
  return {
    score: denominator ? Math.round(numerator / denominator) : null,
    provisional: dimensions.some((k) => scores[k] === null),
    dimensions: scores,
  };
}
export function distanceMeters(
  a: Pick<Geo, "latitude" | "longitude">,
  b: Pick<Geo, "latitude" | "longitude">,
) {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude),
    dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function locationGate(
  fix: Geo,
  site: Pick<Geo, "latitude" | "longitude">,
  now: number,
  policy = defaultPolicy,
) {
  const distance = distanceMeters(fix, site),
    age = Math.abs(now - Date.parse(fix.timestamp));
  const reason =
    age > policy.maxFixAgeSeconds * 1000
      ? "GPS fix is stale. Refresh location."
      : fix.accuracy > policy.maxAccuracy
        ? "GPS accuracy is too low. Move to open sky and retry."
        : distance + fix.accuracy > policy.radius
          ? "You must be reliably inside the 250 m site boundary."
          : null;
  return { distance: Math.round(distance), allowed: reason === null, reason };
}
export function captureTimeGate(
  capturedAt: string,
  start: string,
  end: string,
  uploadedAt: string,
) {
  const t = Date.parse(capturedAt);
  if (!Number.isFinite(t) || t > Date.parse(uploadedAt) + 120000)
    return "Capture time is invalid or in the future.";
  if (t < Date.parse(start) || t > Date.parse(end))
    return "Capture time is outside the authorized TCN window.";
  return null;
}
export function hashDistance(a: string, b: string) {
  if (a.length !== b.length) return 64;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    let v = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (v) {
      n += v & 1;
      v >>= 1;
    }
  }
  return n;
}
export function evidenceDecision(
  findings: Finding[],
  analysisComplete: boolean,
): EvidenceState {
  if (findings.some((f) => f.severity === "block")) return "Retake required";
  if (!analysisComplete) return "Pending analysis";
  return "Supervisor review";
}
export function localToIso(value: string) {
  return value ? new Date(value + ":00+03:00").toISOString() : "";
}
export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
