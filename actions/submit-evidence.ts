import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import {
  CIVIL_NIGHT_DEGREES,
  CLOCK_TOLERANCE_MS,
  decideEvidence,
  type FindingDraft,
  assessLocation,
  canActOnWorkOrder,
  hammingDistance,
  loadWorkOrder,
  locationIntegrityFlags,
  MIN_SHARPNESS,
  MIN_SHORT_SIDE_PX,
  recordAudit,
  requireStaff,
  solarAltitudeDegrees,
  TIMESTAMP_TOLERANCE_MS,
} from "../server/lib/pmr.js";
import { formatRiyadh } from "../server/lib/time.js";

export default defineAction({
  description:
    "Submit a captured or admin-approved photograph for an ETL task. The server re-checks geofence, gallery approval, time window, daylight consistency, quality, and duplicates, then stores the evidence with its gate findings. Hard capture blocks (location, gallery) store nothing and are audited.",
  schema: z.object({
    workOrderId: z.string(),
    taskId: z.string(),
    source: z.enum(["camera", "admin_import"]),
    galleryApprovalId: z.string().optional(),
    imageSha256: z.string().regex(/^[a-f0-9]{64}$/),
    averageHash: z.string().regex(/^[01]{64}$/),
    width: z.number().int().min(1),
    height: z.number().int().min(1),
    sharpness: z.number().min(0),
    skyFraction: z.number().min(0).max(1),
    meanLuma: z.number().min(0).max(1),
    deviceCapturedAt: z.string().datetime(),
    deviceTimezone: z.string().min(1),
    clientSentAt: z.string().datetime(),
    location: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().min(0),
      timestamp: z.number(),
    }),
  }),
  run: async (input) => {
    const staff = await requireStaff(["technician"]);
    const order = await loadWorkOrder(input.workOrderId);
    if (!canActOnWorkOrder(staff, order)) {
      fail("This work order is not assigned to you.", { statusCode: 403 });
    }
    const db = getDb();
    const [task] = await db
      .select()
      .from(schema.captureTasks)
      .where(
        and(
          eq(schema.captureTasks.id, input.taskId),
          eq(schema.captureTasks.workOrderId, order.id),
        ),
      )
      .limit(1);
    if (!task) fail("Task not found for this work order.", { statusCode: 404 });
    if (!order.checkedInAt) {
      fail("Check in at the site before capturing evidence.", {
        statusCode: 409,
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const { location } = input;
    const captureAudit = {
      workOrderId: order.id,
      entityType: "task",
      entityId: task.id,
      actorEmail: staff.email,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracyMeters: location.accuracy,
    };

    const assessment = assessLocation(order, {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
    });
    if (assessment.outcome !== "inside") {
      await recordAudit({
        ...captureAudit,
        eventType: "capture_blocked_location",
        message: assessment.reason,
        distanceMeters: assessment.distance,
      });
      fail(assessment.reason, { statusCode: 422 });
    }

    let approval: typeof schema.galleryApprovals.$inferSelect | null = null;
    if (input.source === "admin_import") {
      const [row] = input.galleryApprovalId
        ? await db
            .select()
            .from(schema.galleryApprovals)
            .where(eq(schema.galleryApprovals.id, input.galleryApprovalId))
            .limit(1)
        : [];
      const problems: string[] = [];
      if (!row || row.workOrderId !== order.id) {
        problems.push("no approval exists for this work order");
      } else {
        if (row.technicianEmail !== staff.email)
          problems.push("the approval names a different technician");
        if (Date.parse(row.expiresAt) <= now.getTime())
          problems.push("the approval has expired");
        if (row.imagesUsed >= row.maxImages)
          problems.push("the approved image limit has been reached");
        if (
          !row.evidenceGroups
            .split(",")
            .map((group) => group.trim())
            .includes(task.evidenceGroup)
        )
          problems.push(`evidence group ${task.evidenceGroup} is not approved`);
      }
      if (problems.length > 0 || !row) {
        const message = `Gallery upload not authorized: ${problems.join("; ")}.`;
        await recordAudit({
          ...captureAudit,
          eventType: "capture_blocked_gallery",
          message,
          distanceMeters: assessment.distance,
        });
        fail(message, { statusCode: 403 });
      }
      approval = row;
    }

    const capturedAt = new Date(input.deviceCapturedAt);
    const gpsTime = new Date(location.timestamp);
    const serverOffsetMs = now.getTime() - Date.parse(input.clientSentAt);
    const isCamera = input.source === "camera";
    const clockConflicts: string[] = [];
    if (Math.abs(serverOffsetMs) > CLOCK_TOLERANCE_MS) {
      clockConflicts.push(
        `Device clock is ${Math.round(serverOffsetMs / 1000)} s away from server time.`,
      );
    }
    if (isCamera && Math.abs(capturedAt.getTime() - gpsTime.getTime()) > TIMESTAMP_TOLERANCE_MS) {
      clockConflicts.push(
        `Device capture time differs from GPS time by ${Math.round((capturedAt.getTime() - gpsTime.getTime()) / 1000)} s.`,
      );
    }
    if (capturedAt.getTime() > now.getTime() + TIMESTAMP_TOLERANCE_MS) {
      clockConflicts.push("Capture time is in the future.");
    }
    const timeVerified = isCamera && clockConflicts.length === 0;

    const findings: FindingDraft[] = [];
    for (const message of clockConflicts) {
      findings.push({
        code: "clock_conflict",
        severity: "blocking",
        resolvable: true,
        message: `${message} Supervisor must confirm the capture time.`,
      });
    }
    if (!isCamera) {
      findings.push({
        code: "imported_time_unverified",
        severity: "blocking",
        resolvable: true,
        message:
          "Admin-approved import: capture time comes from file metadata and cannot be verified on the device. Supervisor review required.",
      });
    }

    const windowStart = new Date(order.tcnStart);
    const windowEnd = new Date(order.tcnEnd);
    if (capturedAt < windowStart || capturedAt > windowEnd) {
      const message = `Capture time ${formatRiyadh(capturedAt)} is outside the authorized TCN window (${formatRiyadh(windowStart)} to ${formatRiyadh(windowEnd)}).`;
      findings.push(
        timeVerified
          ? {
              code: "tcn_window_violation",
              severity: "blocking",
              resolvable: false,
              message: `${message} Retake within the window.`,
            }
          : {
              code: "tcn_window_unconfirmed",
              severity: "blocking",
              resolvable: true,
              message: `${message} The time is unverified, so a supervisor must confirm it.`,
            },
      );
    }
    if (order.checkedInAt && capturedAt < new Date(order.checkedInAt)) {
      findings.push({
        code: "precedes_check_in",
        severity: "blocking",
        resolvable: true,
        message: `Capture time ${formatRiyadh(capturedAt)} precedes check-in at ${formatRiyadh(order.checkedInAt)}.`,
      });
    }

    const sunAltitude = solarAltitudeDegrees(
      order.siteLatitude,
      order.siteLongitude,
      capturedAt,
    );
    const clearDaylight = input.skyFraction >= 0.2 && input.meanLuma >= 0.45;
    if (sunAltitude < CIVIL_NIGHT_DEGREES && clearDaylight) {
      findings.push({
        code: "daylight_time_conflict",
        severity: "blocking",
        resolvable: true,
        message: `The sun was ${Math.abs(Math.round(sunAltitude))}° below the horizon at this site at the recorded capture time, but the photograph shows clear daylight. Retake or resolve with a supervisor.`,
      });
    }

    if (Math.min(input.width, input.height) < MIN_SHORT_SIDE_PX) {
      findings.push({
        code: "resolution_low",
        severity: "blocking",
        resolvable: false,
        message: `Photograph short side is ${Math.min(input.width, input.height)} px. Capture at least ${MIN_SHORT_SIDE_PX} px.`,
      });
    }
    if (input.sharpness < MIN_SHARPNESS) {
      findings.push({
        code: "image_blurred",
        severity: "blocking",
        resolvable: false,
        message:
          "Photograph is blurred. Hold the device steady, wait for focus, and capture again.",
      });
    }

    for (const flag of locationIntegrityFlags({
      accuracy: location.accuracy,
      positionAgeMs: Date.parse(input.clientSentAt) - location.timestamp,
    })) {
      findings.push({
        code: "location_integrity",
        severity: "blocking",
        resolvable: true,
        message: `Location signal flagged for review: ${flag}`,
      });
    }

    const prior = await db
      .select({
        id: schema.evidence.id,
        workOrderId: schema.evidence.workOrderId,
        imageSha256: schema.evidence.imageSha256,
        averageHash: schema.evidence.averageHash,
      })
      .from(schema.evidence);
    const exact = prior.find((row) => row.imageSha256 === input.imageSha256);
    if (exact) {
      findings.push(
        exact.workOrderId === order.id
          ? {
              code: "duplicate_capture",
              severity: "blocking",
              resolvable: false,
              message: "This photograph was already submitted for this work order.",
            }
          : {
              code: "historical_reuse",
              severity: "blocking",
              resolvable: false,
              message:
                "This photograph exactly matches evidence from another work order. Historical reuse is blocked.",
            },
      );
    } else if (
      prior.some(
        (row) => hammingDistance(row.averageHash, input.averageHash) <= 5,
      )
    ) {
      findings.push({
        code: "possible_reuse",
        severity: "blocking",
        resolvable: true,
        message:
          "Photograph is visually near-identical to earlier evidence. Supervisor must confirm it is a new capture.",
      });
    }

    const decision = decideEvidence(findings);
    const evidenceId = crypto.randomUUID();
    await db.insert(schema.evidence).values({
      id: evidenceId,
      workOrderId: order.id,
      taskId: task.id,
      technicianEmail: staff.email,
      source: input.source,
      galleryApprovalId: approval?.id ?? null,
      imageSha256: input.imageSha256,
      averageHash: input.averageHash,
      width: input.width,
      height: input.height,
      sharpness: input.sharpness,
      skyFraction: input.skyFraction,
      meanLuma: input.meanLuma,
      daylightSignal: clearDaylight ? "clear_daylight" : "none",
      deviceCapturedAt: capturedAt.toISOString(),
      deviceTimezone: input.deviceTimezone,
      gpsTime: isCamera ? gpsTime.toISOString() : null,
      clientSentAt: input.clientSentAt,
      uploadedAt: nowIso,
      serverOffsetMs: Math.round(serverOffsetMs),
      latitude: location.latitude,
      longitude: location.longitude,
      accuracyMeters: location.accuracy,
      distanceMeters: assessment.distance,
      locationTimestamp: gpsTime.toISOString(),
      sunAltitudeDegrees: sunAltitude,
      visionStatus: "awaiting_provider",
      decision,
      decisionBasis: "automated_gates",
    });
    if (findings.length > 0) {
      await db.insert(schema.evidenceFindings).values(
        findings.map((finding) => ({
          id: crypto.randomUUID(),
          evidenceId,
          kind: "gate",
          code: finding.code,
          severity: finding.severity,
          resolvable: finding.resolvable,
          message: finding.message,
          status: "open",
          createdAt: nowIso,
        })),
      );
    }
    if (approval) {
      await db
        .update(schema.galleryApprovals)
        .set({ imagesUsed: sql`${schema.galleryApprovals.imagesUsed} + 1` })
        .where(eq(schema.galleryApprovals.id, approval.id));
    }

    await recordAudit({
      ...captureAudit,
      entityType: "evidence",
      entityId: evidenceId,
      eventType: "evidence_submitted",
      message: `${decision} with ${findings.length} gate finding(s). Equipment recognition awaiting provider.`,
      distanceMeters: assessment.distance,
    });

    const [stored] = await db
      .select()
      .from(schema.evidence)
      .where(eq(schema.evidence.id, evidenceId))
      .limit(1);
    const storedFindings = await db
      .select()
      .from(schema.evidenceFindings)
      .where(eq(schema.evidenceFindings.evidenceId, evidenceId));
    return {
      evidence: { ...stored, findings: storedFindings },
      expectedEquipment: task.expectedEquipment,
      requiredDetails: task.requiredDetails,
    };
  },
});
