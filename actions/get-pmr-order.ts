import { defineAction } from "@agent-native/core/action";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db";
import { orderAccess } from "../server/pmr/access";
export default defineAction({
  description:
    "Read an authorized PMR work order, evidence, checklist results and audit history.",
  http: { method: "GET" },
  schema: z.object({ id: z.string().uuid().describe("Work order UUID") }),
  run: async ({ id }) => {
    const { user, order } = await orderAccess(id);
    const db = getDb();
    const [results, evidence, approvals, audit] = await Promise.all([
      db
        .select()
        .from(schema.pmrResults)
        .where(eq(schema.pmrResults.orderId, id))
        .limit(3000),
      db
        .select({
          id: schema.pmrEvidence.id,
          groupId: schema.pmrEvidence.groupId,
          instance: schema.pmrEvidence.instance,
          source: schema.pmrEvidence.source,
          capturedAt: schema.pmrEvidence.capturedAt,
          uploadedAt: schema.pmrEvidence.uploadedAt,
          findings: schema.pmrEvidence.findings,
          quality: schema.pmrEvidence.quality,
          analysis: schema.pmrEvidence.analysis,
          state: schema.pmrEvidence.state,
          linkedEtls: schema.pmrEvidence.linkedEtls,
          reviewNote: schema.pmrEvidence.reviewNote,
          revision: schema.pmrEvidence.revision,
        })
        .from(schema.pmrEvidence)
        .where(eq(schema.pmrEvidence.orderId, id))
        .limit(1000),
      db
        .select()
        .from(schema.pmrApprovals)
        .where(eq(schema.pmrApprovals.orderId, id))
        .limit(100),
      db
        .select()
        .from(schema.pmrAudit)
        .where(eq(schema.pmrAudit.orderId, id))
        .orderBy(desc(schema.pmrAudit.createdAt))
        .limit(100),
    ]);
    return { user, order, results, evidence, approvals, audit };
  },
});
