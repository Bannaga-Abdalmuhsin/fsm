import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { recordAudit, requireStaff } from "../server/lib/pmr.js";

export default defineAction({
  description:
    "Supervisor decision on evidence in review or pending analysis. 'accept' requires a note and is refused while any non-resolvable gate finding is open; 'retake' sends the task back to the technician. Every decision is audited.",
  schema: z.object({
    evidenceId: z.string(),
    decision: z.enum(["accept", "retake"]),
    note: z.string().trim().min(10).describe("Documented reason for the decision"),
  }),
  run: async ({ evidenceId, decision, note }) => {
    const staff = await requireStaff(["supervisor"]);
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.evidence)
      .where(eq(schema.evidence.id, evidenceId))
      .limit(1);
    if (!row) fail("Evidence not found.", { statusCode: 404 });
    if (row.decision !== "supervisor_review" && row.decision !== "pending_analysis") {
      fail(`Evidence is ${row.decision.replace(/_/g, " ")} and cannot be resolved here.`, {
        statusCode: 409,
      });
    }

    const openFindings = await db
      .select()
      .from(schema.evidenceFindings)
      .where(
        and(
          eq(schema.evidenceFindings.evidenceId, evidenceId),
          eq(schema.evidenceFindings.kind, "gate"),
          eq(schema.evidenceFindings.status, "open"),
        ),
      );
    const now = new Date().toISOString();

    if (decision === "accept") {
      const hard = openFindings.filter((f) => f.severity === "blocking" && !f.resolvable);
      if (hard.length > 0) {
        fail(
          `Cannot accept: ${hard.map((f) => f.code).join(", ")} must be retaken.`,
          { statusCode: 422 },
        );
      }
      await db
        .update(schema.evidenceFindings)
        .set({ status: "resolved", resolutionNote: note, resolvedBy: staff.email, resolvedAt: now })
        .where(
          and(
            eq(schema.evidenceFindings.evidenceId, evidenceId),
            eq(schema.evidenceFindings.kind, "gate"),
            eq(schema.evidenceFindings.status, "open"),
          ),
        );
      await db
        .update(schema.evidence)
        .set({
          decision: "accepted",
          decisionBasis:
            row.visionStatus === "awaiting_provider"
              ? "supervisor_manual_confirmation"
              : "supervisor_resolution",
          decisionNote: note,
          decidedBy: staff.email,
          decidedAt: now,
        })
        .where(eq(schema.evidence.id, evidenceId));
    } else {
      await db
        .update(schema.evidence)
        .set({
          decision: "retake_required",
          decisionBasis: "supervisor_resolution",
          decisionNote: note,
          decidedBy: staff.email,
          decidedAt: now,
        })
        .where(eq(schema.evidence.id, evidenceId));
    }

    await recordAudit({
      workOrderId: row.workOrderId,
      entityType: "evidence",
      entityId: evidenceId,
      eventType: `supervisor_${decision}`,
      actorEmail: staff.email,
      message: `${decision === "accept" ? "Accepted" : "Retake required"}: ${note}`,
    });

    const [updated] = await db
      .select()
      .from(schema.evidence)
      .where(eq(schema.evidence.id, evidenceId))
      .limit(1);
    return updated;
  },
});
