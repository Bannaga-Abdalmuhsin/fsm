import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db";
import { orderAccess } from "../server/pmr/access";
export default defineAction({
  description:
    "Export the complete authorized PMR evidence manifest and checklist result rows for a report.",
  http: { method: "GET" },
  schema: z.object({ id: z.string().uuid().describe("Work order UUID") }),
  run: async ({ id }) => {
    const { order } = await orderAccess(id);
    const [results, photos] = await Promise.all([
      getDb()
        .select()
        .from(schema.pmrResults)
        .where(eq(schema.pmrResults.orderId, id))
        .limit(3000),
      getDb()
        .select({
          id: schema.pmrEvidence.id,
          groupId: schema.pmrEvidence.groupId,
          instance: schema.pmrEvidence.instance,
          source: schema.pmrEvidence.source,
          capturedAt: schema.pmrEvidence.capturedAt,
          uploadedAt: schema.pmrEvidence.uploadedAt,
          gps: schema.pmrEvidence.gps,
          sha: schema.pmrEvidence.sha,
          findings: schema.pmrEvidence.findings,
          quality: schema.pmrEvidence.quality,
          state: schema.pmrEvidence.state,
          linkedEtls: schema.pmrEvidence.linkedEtls,
          reviewNote: schema.pmrEvidence.reviewNote,
        })
        .from(schema.pmrEvidence)
        .where(eq(schema.pmrEvidence.orderId, id))
        .limit(1000),
    ]);
    return {
      id,
      format: "FSM PMR evidence manifest",
      generatedAt: new Date().toISOString(),
      order,
      results,
      photos,
    };
  },
});
