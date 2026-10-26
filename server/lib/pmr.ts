import { fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { eq } from "drizzle-orm";

import { getDb, schema } from "../db.js";

export const GEOFENCE_METERS = 250;
export const MAX_GPS_ACCURACY_METERS = 100;
export const MIN_SHORT_SIDE_PX = 720;
export const MIN_SHARPNESS = 50;
export const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;
export const TIMESTAMP_TOLERANCE_MS = 2 * 60 * 1000;
export const CIVIL_NIGHT_DEGREES = -6;
export const ROLES = ["technician", "supervisor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type StaffMember = typeof schema.staffMembers.$inferSelect;
export type WorkOrder = typeof schema.workOrders.$inferSelect;

export async function resolveStaff(email: string): Promise<StaffMember | null> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.staffMembers)
    .where(eq(schema.staffMembers.email, email))
    .limit(1);
  if (existing) return existing;

  const [anyStaff] = await db
    .select({ email: schema.staffMembers.email })
    .from(schema.staffMembers)
    .limit(1);
  if (anyStaff) return null;

  const ownerEmail = process.env.PMR_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail || email.trim().toLowerCase() !== ownerEmail) return null;

  const [created] = await db
    .insert(schema.staffMembers)
    .values({
      email,
      name: email,
      role: "admin",
      createdAt: new Date().toISOString(),
    })
    .returning();
  return created;
}

export async function requireStaff(allowed: Role[]): Promise<StaffMember> {
  const email = getRequestUserEmail();
  if (!email) fail("Sign in required.", { statusCode: 401 });
  const member = await resolveStaff(email);
  if (!member) {
    fail("No role is assigned to this account. Ask an administrator.", {
      statusCode: 403,
    });
  }
  if (member.role !== "admin" && !allowed.includes(member.role as Role)) {
    fail("Your role cannot perform this action.", { statusCode: 403 });
  }
  return member;
}

export function canActOnWorkOrder(staff: StaffMember, order: WorkOrder) {
  return (
    staff.role === "admin" ||
    (staff.role === "technician" && order.technicianEmail === staff.email)
  );
}

export async function loadWorkOrder(id: string): Promise<WorkOrder> {
  const db = getDb();
  const [order] = await db
    .select()
    .from(schema.workOrders)
    .where(eq(schema.workOrders.id, id))
    .limit(1);
  if (!order) fail("Work order not found.", { statusCode: 404 });
  return order;
}

export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

export type LocationOutcome = "inside" | "outside" | "retry";

export function assessLocation(
  site: { siteLatitude: number; siteLongitude: number },
  fix: { latitude: number; longitude: number; accuracy: number },
) {
  const distance = distanceMeters(
    site.siteLatitude,
    site.siteLongitude,
    fix.latitude,
    fix.longitude,
  );
  const round = (n: number) => Math.round(n);
  let outcome: LocationOutcome;
  let reason: string;
  if (fix.accuracy > MAX_GPS_ACCURACY_METERS) {
    outcome = "retry";
    reason = `GPS accuracy is ±${round(fix.accuracy)} m. Readings must be ±${MAX_GPS_ACCURACY_METERS} m or better. Move to an open area and retry.`;
  } else if (distance + fix.accuracy <= GEOFENCE_METERS) {
    outcome = "inside";
    reason = `You are ${round(distance)} m from the registered site.`;
  } else if (distance - fix.accuracy > GEOFENCE_METERS) {
    outcome = "outside";
    reason = `You are ${round(distance)} m from the registered site. Capture unlocks within ${GEOFENCE_METERS} m.`;
  } else {
    outcome = "retry";
    reason = `Your position (${round(distance)} m away, ±${round(fix.accuracy)} m) cannot confirm you are within ${GEOFENCE_METERS} m. Retry GPS.`;
  }
  return { outcome, distance, reason };
}

export function locationIntegrityFlags(input: {
  accuracy: number;
  positionAgeMs: number;
}) {
  const flags: string[] = [];
  if (input.accuracy < 1)
    flags.push("GPS accuracy is implausibly exact (below 1 m).");
  if (input.positionAgeMs > 60_000)
    flags.push("Position fix is more than 60 seconds old.");
  return flags;
}

export function solarAltitudeDegrees(
  latitude: number,
  longitude: number,
  date: Date,
) {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const meanLongitude = (280.46 + 0.9856474 * n) % 360;
  const meanAnomaly = ((357.528 + 0.9856003 * n) % 360) * rad;
  const eclipticLongitude =
    (meanLongitude +
      1.915 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly)) *
    rad;
  const obliquity = (23.439 - 0.0000004 * n) * rad;
  const declination = Math.asin(
    Math.sin(obliquity) * Math.sin(eclipticLongitude),
  );
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );
  const siderealDegrees = 280.46061837 + 360.98564736629 * n + longitude;
  const hourAngle = siderealDegrees * rad - rightAscension;
  const sinAltitude =
    Math.sin(latitude * rad) * Math.sin(declination) +
    Math.cos(latitude * rad) *
      Math.cos(declination) *
      Math.cos(hourAngle);
  return Math.asin(sinAltitude) / rad;
}

export function hammingDistance(a: string, b: string) {
  let distance = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) distance++;
  }
  return distance + Math.abs(a.length - b.length);
}

export async function recordAudit(entry: {
  workOrderId?: string | null;
  entityType: string;
  entityId?: string | null;
  eventType: string;
  actorEmail: string;
  message: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  distanceMeters?: number | null;
}) {
  const db = getDb();
  await db.insert(schema.auditEvents).values({
    id: crypto.randomUUID(),
    workOrderId: entry.workOrderId ?? null,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    eventType: entry.eventType,
    actorEmail: entry.actorEmail,
    message: entry.message,
    latitude: entry.latitude ?? null,
    longitude: entry.longitude ?? null,
    accuracyMeters: entry.accuracyMeters ?? null,
    distanceMeters: entry.distanceMeters ?? null,
    createdAt: new Date().toISOString(),
  });
}

export type FindingDraft = {
  code: string;
  severity: "blocking" | "advisory";
  resolvable: boolean;
  message: string;
};

export function decideEvidence(findings: FindingDraft[]) {
  const blocking = findings.filter((f) => f.severity === "blocking");
  if (blocking.some((f) => !f.resolvable)) return "retake_required" as const;
  if (blocking.length > 0) return "supervisor_review" as const;
  return "pending_analysis" as const;
}
