import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db";
import { orderAccess, requireRole, audit } from "../server/pmr/access";
export default defineAction({
  description:
    "Supervisor review one original photo; hard gates cannot be overridden by score or manual acceptance.",
  schema: z.object({
    id: z.string().uuid().describe("Evidence UUID"),
    revision: z
      .number()
      .int()
      .describe("Current evidence revision for conflict protection"),
    decision: z
      .enum(["Accepted", "Retake required", "Supervisor review"])
      .describe("Reviewer decision"),
    note: z
      .string()
      .min(5)
      .max(2000)
      .describe("Mandatory reviewer explanation"),
    linkedEtls: z
      .array(z.string())
      .min(1)
      .max(144)
      .describe("ETLs actually visible in this photo"),
    conditionIssue: z
      .string()
      .max(1000)
      .describe("Visible housekeeping/condition issue; empty if none"),
  }),
  run: async ({ id, revision, decision, note, linkedEtls, conditionIssue }) => {
    const db = getDb();
    const [item] = await db
      .select()
      .from(schema.pmrEvidence)
      .where(eq(schema.pmrEvidence.id, id))
      .limit(1);
    if (!item) fail("Evidence not found.", { statusCode: 404 });
    const { user, order } = await orderAccess(item!.orderId);
    requireRole(user, "admin", "supervisor");
    if (!user.regions.includes(order.region))
      fail("Region is outside your scope.", { statusCode: 403 });
    const group = order.checklist.find((g) => g.id === item!.groupId);
    if (linkedEtls.some((c) => !group?.etls.some((e) => e.code === c)))
      fail("Evidence can only support the selected group ETLs.", {
        statusCode: 400,
      });
    if (
      decision === "Accepted" &&
      (item!.findings.some((f) => f.severity === "block") ||
        conditionIssue.trim())
    )
      fail(
        "Resolve the blocking issue with corrected evidence; acceptance cannot override it.",
        { statusCode: 409 },
      );
    const findings = conditionIssue.trim()
      ? [
          ...item!.findings,
          {
            code: "condition",
            message: conditionIssue.trim(),
            severity: "block" as const,
            confidence: 1,
          },
        ]
      : item!.findings;
    const [row] = await db
      .update(schema.pmrEvidence)
      .set({
        state: conditionIssue.trim() ? "Retake required" : decision,
        reviewNote: note,
        linkedEtls,
        findings,
        revision: revision + 1,
      })
      .where(
        and(
          eq(schema.pmrEvidence.id, id),
          eq(schema.pmrEvidence.revision, revision),
        ),
      )
      .returning({ id: schema.pmrEvidence.id });
    if (!row)
      fail("Evidence changed. Refresh before reviewing.", { statusCode: 409 });
    await audit(
      user,
      order.id,
      "Evidence reviewed",
      `${id}: ${decision}; ${note}; ${conditionIssue}`,
    );
    return { id: row.id };
  },
});
