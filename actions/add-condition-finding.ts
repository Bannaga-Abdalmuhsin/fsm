import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { recordAudit, requireStaff } from "../server/lib/pmr.js";

export default defineAction({
  description:
    "Record a visible condition defect (for example housekeeping, corrosion, or battery swelling) against an evidence item. The task stays 'corrective action required' until accepted evidence is submitted after this finding.",
  schema: z.object({
    evidenceId: z.string(),
    code: z.enum([
      "housekeeping_defect",
      "corrosion",
      "damaged_insulation",
      "missing_label",
      "battery_swelling",
      "blocked_ventilation",
    ]),
    message: z.string().trim().min(10).describe("What is visible and where"),
  }),
  run: async ({ evidenceId, code, message }) => {
    const staff = await requireStaff(["supervisor"]);
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.evidence)
      .where(eq(schema.evidence.id, evidenceId))
      .limit(1);
    if (!row) fail("Evidence not found.", { statusCode: 404 });

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.insert(schema.evidenceFindings).values({
      id,
      evidenceId,
      kind: "condition",
      code,
      severity: "blocking",
      resolvable: false,
      message,
      status: "open",
      createdAt: now,
    });
    await recordAudit({
      workOrderId: row.workOrderId,
      entityType: "evidence",
      entityId: evidenceId,
      eventType: "condition_recorded",
      actorEmail: staff.email,
      message: `${code}: ${message}`,
    });
    return { id, code, message, createdAt: now };
  },
});
