import { defineAction, fail } from "@agent-native/core/action";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { loadWorkOrder, requireStaff } from "../server/lib/pmr.js";

export default defineAction({
  description:
    "Get one work order with its ETL tasks (derived status), evidence with findings, the caller's active gallery approvals, and recent audit events.",
  schema: z.object({
    id: z.string().describe("Work order id"),
  }),
  http: { method: "GET" },
  run: async ({ id }) => {
    const staff = await requireStaff(["technician", "supervisor"]);
    const order = await loadWorkOrder(id);
    if (staff.role === "technician" && order.technicianEmail !== staff.email) {
      fail("This work order is not assigned to you.", { statusCode: 403 });
    }

    const db = getDb();
    const tasks = await db
      .select()
      .from(schema.captureTasks)
      .where(eq(schema.captureTasks.workOrderId, id))
      .orderBy(asc(schema.captureTasks.sortOrder));
    const evidenceRows = await db
      .select()
      .from(schema.evidence)
      .where(eq(schema.evidence.workOrderId, id))
      .orderBy(desc(schema.evidence.uploadedAt));
    const evidenceIds = evidenceRows.map((row) => row.id);
    const findingRows = evidenceIds.length
      ? await db
          .select()
          .from(schema.evidenceFindings)
          .where(inArray(schema.evidenceFindings.evidenceId, evidenceIds))
      : [];
    const approvals = await db
      .select()
      .from(schema.galleryApprovals)
      .where(eq(schema.galleryApprovals.workOrderId, id));
    const audit = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.workOrderId, id))
      .orderBy(desc(schema.auditEvents.createdAt))
      .limit(40);

    const now = Date.now();
    const galleryAccess = approvals
      .filter(
        (approval) =>
          approval.technicianEmail === staff.email &&
          Date.parse(approval.expiresAt) > now &&
          approval.imagesUsed < approval.maxImages,
      )
      .map((approval) => ({
        id: approval.id,
        evidenceGroups: approval.evidenceGroups.split(",").map((g) => g.trim()),
        reason: approval.reason,
        expiresAt: approval.expiresAt,
        imagesRemaining: approval.maxImages - approval.imagesUsed,
      }));

    const evidenceView = evidenceRows.map((row) => ({
      ...row,
      findings: findingRows.filter((finding) => finding.evidenceId === row.id),
    }));

    const tasksView = tasks.map((task) => {
      const taskEvidence = evidenceView.filter((row) => row.taskId === task.id);
      const conditions = taskEvidence.flatMap((row) =>
        row.findings.filter((finding) => finding.kind === "condition"),
      );
      const latestCondition = conditions.reduce<string | null>(
        (latest, finding) =>
          !latest || finding.createdAt > latest ? finding.createdAt : latest,
        null,
      );
      const accepted = taskEvidence.filter((row) => row.decision === "accepted");
      let status: "corrective_action_required" | "complete" | "in_review" | "open";
      if (
        latestCondition &&
        !accepted.some((row) => row.uploadedAt > latestCondition)
      ) {
        status = "corrective_action_required";
      } else if (accepted.length > 0) {
        status = "complete";
      } else if (taskEvidence.length > 0) {
        status = "in_review";
      } else {
        status = "open";
      }
      return { ...task, status, evidence: taskEvidence };
    });

    return {
      workOrder: order,
      tasks: tasksView,
      galleryAccess,
      audit,
    };
  },
});
