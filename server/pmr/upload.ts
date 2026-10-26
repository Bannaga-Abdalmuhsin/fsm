import { fail } from "@agent-native/core/action";
import {
  putPrivateBlob,
  deletePrivateBlob,
  getPrivateBlobStorageReadinessForRequest,
} from "@agent-native/core/private-blob";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import {
  geoSchema,
  locationGate,
  captureTimeGate,
  quality,
  hashDistance,
  evidenceDecision,
  type Finding,
} from "../../shared/pmr";
import { getDb, schema } from "../db";
import { orderAccess, audit } from "./access";
import { imageMetrics, visionAnalysis, daylightFinding } from "./image";
export const captureSchema = z.object({
  orderId: z.string().uuid(),
  groupId: z.string().max(20),
  instance: z.string().regex(/^\d+$/),
  captureId: z.string().uuid(),
  capturedAt: z.string().datetime({ offset: true }),
  gps: geoSchema,
  source: z.enum(["camera", "gallery"]),
  approvalId: z.string().uuid().optional(),
});
export async function storeEvidence(bytes: Buffer, input: unknown) {
  const data = captureSchema.parse(input);
  const { user, order } = await orderAccess(data.orderId);
  if (order.assignee !== user.email)
    fail("Only the assigned technician may capture evidence.", {
      statusCode: 403,
    });
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.pmrEvidence.id })
    .from(schema.pmrEvidence)
    .where(
      and(
        eq(schema.pmrEvidence.ownerEmail, user.email),
        eq(schema.pmrEvidence.captureId, data.captureId),
      ),
    )
    .limit(1);
  if (existing) return { ...existing, idempotent: true };
  if (["Submitted", "Approved"].includes(order.status))
    fail("Work order is locked for review.", { statusCode: 409 });
  if (data.source === "gallery") {
    const [a] = await db
      .select()
      .from(schema.pmrApprovals)
      .where(eq(schema.pmrApprovals.id, data.approvalId ?? ""))
      .limit(1);
    if (
      !a ||
      a.orderId !== order.id ||
      a.technician !== user.email ||
      a.revokedAt ||
      Date.parse(a.expiresAt) < Date.now() ||
      a.used >= a.maxImages ||
      !a.groups.includes(data.groupId)
    )
      fail(
        "A valid scoped admin approval is required before gallery processing.",
        { statusCode: 403 },
      );
  }
  const group = order.checklist.find((g) => g.id === data.groupId);
  if (
    !group ||
    Number(data.instance) < 1 ||
    Number(data.instance) > (order.inventory[data.groupId] ?? 1)
  )
    fail("Unknown equipment group or instance.", { statusCode: 400 });
  if (
    !order.checkedInAt ||
    Date.parse(data.capturedAt) < Date.parse(order.checkedInAt)
  )
    fail("Capture must follow a valid site check-in.", { statusCode: 409 });
  const gate = locationGate(
    data.gps,
    order,
    Date.parse(data.capturedAt),
    order.policy,
  );
  const now = new Date().toISOString();
  const reason =
    gate.reason ??
    captureTimeGate(data.capturedAt, order.tcnStart, order.tcnEnd, now);
  if (reason) {
    await audit(user, order.id, "Capture rejected", reason);
    fail(reason, { statusCode: 409 });
  }
  if (bytes.length < 1000 || bytes.length > 15 * 1024 * 1024)
    fail("Image must be between 1 KB and 15 MB.", { statusCode: 400 });
  const readiness = await getPrivateBlobStorageReadinessForRequest();
  if (!readiness.configured)
    fail(
      "Private evidence storage is not configured. Your encrypted draft remains on this device.",
      { statusCode: 503 },
    );
  const metrics = await imageMetrics(bytes);
  const findings: Finding[] = [];
  if (metrics.clarity < order.policy.review)
    findings.push({
      code: "clarity",
      message:
        "Photo may be blurred, too dark, overexposed or too small. Take a readable close-up.",
      severity: "review",
      confidence: 0.75,
    });
  const historical = await db
    .select({
      id: schema.pmrEvidence.id,
      orderId: schema.pmrEvidence.orderId,
      sha: schema.pmrEvidence.sha,
      perceptualHash: schema.pmrEvidence.perceptualHash,
    })
    .from(schema.pmrEvidence)
    .where(
      user.orgId
        ? eq(schema.pmrEvidence.orgId, user.orgId)
        : and(
            isNull(schema.pmrEvidence.orgId),
            eq(schema.pmrEvidence.ownerEmail, user.email),
          ),
    )
    .limit(5000);
  for (const h of historical) {
    if (h.orderId === order.id) continue;
    if (h.sha === metrics.sha) {
      findings.push({
        code: "historical-reuse",
        message:
          "This original image matches evidence from another work order.",
        severity: "block",
        confidence: 1,
      });
      break;
    }
    if (
      hashDistance(h.perceptualHash, metrics.perceptualHash) <=
      order.policy.nearDuplicateDistance
    )
      findings.push({
        code: "similar-history",
        message:
          "A visually similar image exists in another work order. Supervisor review required; similarity alone is not proof of reuse.",
        severity: "review",
        confidence: 0.65,
      });
  }
  if (historical.length === 5000)
    findings.push({
      code: "history-limit",
      message: "Historical similarity scan reached its review limit.",
      severity: "review",
      confidence: 1,
    });
  if (data.source === "gallery")
    findings.push({
      code: "import-provenance",
      message:
        "Admin-approved gallery import: original capture time/location are not independently established by upload metadata.",
      severity: "review",
      confidence: 1,
    });
  const vision = await visionAnalysis(
    bytes,
    metrics.mime,
    group!.title,
    group!.etls.map((e) => e.description),
  );
  findings.push(...vision.findings);
  if (vision.data) {
    const watermark = vision.data.captureWatermark;
    if (
      watermark.timestampIso &&
      /(?:Z|[+-]\d{2}:\d{2})$/.test(watermark.timestampIso)
    ) {
      const time = Date.parse(watermark.timestampIso);
      if (
        Number.isFinite(time) &&
        Math.abs(time - Date.parse(data.capturedAt)) >
          order.policy.timeToleranceSeconds * 1000
      )
        findings.push({
          code: "watermark-time-conflict",
          message:
            "Visible capture timestamp conflicts with this work-order capture record.",
          severity: watermark.confidence >= 0.95 ? "block" : "review",
          confidence: watermark.confidence,
        });
    }
    if (
      watermark.timestampIso &&
      (watermark.latitude === null || watermark.longitude === null)
    )
      findings.push({
        code: "watermark-gps-missing",
        message: "Visible timestamp watermark lacks readable GPS coordinates.",
        severity: "review",
        confidence: watermark.confidence,
      });
    const sunlight = daylightFinding(
      vision.data.scene,
      vision.data.sceneConfidence,
      order.latitude,
      order.longitude,
      data.capturedAt,
    );
    if (sunlight) findings.push(sunlight);
  }
  const q = quality(
    {
      clarity: metrics.clarity,
      coverage: vision.coverage,
      integrity: findings.some((f) => f.code === "historical-reuse")
        ? 0
        : findings.some((f) => f.code === "similar-history")
          ? 50
          : 100,
      location: 100,
      time: findings.some((f) => f.code === "daylight-conflict")
        ? 0
        : data.source === "gallery"
          ? null
          : 100,
    },
    order.policy,
  );
  const id = crypto.randomUUID();
  const handle = await putPrivateBlob({
    data: bytes,
    filename: `${id}.${metrics.mime.split("/")[1]}`,
    mimeType: metrics.mime,
    ownerEmail: user.email,
    metadata: { orderId: order.id },
  });
  if (!handle)
    fail("Private photo storage is unavailable. Retry sync later.", {
      statusCode: 503,
    });
  try {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.pmrOrders)
        .where(eq(schema.pmrOrders.id, order.id))
        .for("update");
      if (!current || ["Submitted", "Approved"].includes(current.status))
        fail("Work order is locked.", { statusCode: 409 });
      if (data.source === "gallery") {
        if (!data.approvalId)
          fail("Gallery upload requires admin approval.", { statusCode: 403 });
        const [approval] = await tx
          .select()
          .from(schema.pmrApprovals)
          .where(eq(schema.pmrApprovals.id, data.approvalId!))
          .for("update");
        if (
          !approval ||
          approval.orderId !== order.id ||
          approval.technician !== user.email ||
          approval.revokedAt ||
          Date.parse(approval.expiresAt) < Date.now() ||
          approval.used >= approval.maxImages ||
          !approval.groups.includes(data.groupId)
        )
          fail("Gallery approval is missing, expired, revoked or exhausted.", {
            statusCode: 403,
          });
        await tx
          .update(schema.pmrApprovals)
          .set({ used: approval.used + 1 })
          .where(eq(schema.pmrApprovals.id, approval.id));
      }
      await tx.insert(schema.pmrEvidence).values({
        id,
        ownerEmail: user.email,
        orgId: user.orgId,
        ...data,
        approvalId: data.approvalId ?? null,
        uploadedAt: now,
        ...metrics,
        handle: handle as unknown as Record<string, unknown>,
        findings,
        quality: q,
        analysis: vision.data
          ? { ...vision.data, complete: true }
          : { complete: false, error: vision.error },
        state: evidenceDecision(findings, vision.complete),
        linkedEtls: [],
      });
    });
  } catch (error) {
    await deletePrivateBlob(handle).catch(() => undefined);
    const [duplicate] = await db
      .select({ id: schema.pmrEvidence.id })
      .from(schema.pmrEvidence)
      .where(
        and(
          eq(schema.pmrEvidence.ownerEmail, user.email),
          eq(schema.pmrEvidence.captureId, data.captureId),
        ),
      )
      .limit(1);
    if (duplicate) return { ...duplicate, idempotent: true };
    throw error;
  }
  await audit(
    user,
    order.id,
    "Photo stored",
    `${id}; ${data.groupId}/${data.instance}; ${data.source}; ${findings.map((f) => f.code).join(", ")}`,
  );
  return { id, state: evidenceDecision(findings, vision.complete) };
}
