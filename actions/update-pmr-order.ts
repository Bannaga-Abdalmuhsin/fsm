import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db";
import { orderAccess, requireRole, audit } from "../server/pmr/access";
export default defineAction({
  description:
    "Submit a completed PMR or let a supervisor return/approve a submitted order, with mandatory coverage gates.",
  schema: z.object({
    id: z.string().uuid().describe("Work order UUID"),
    version: z.number().int().describe("Current work order version"),
    status: z
      .enum(["Submitted", "Returned", "Approved"])
      .describe("Submission or review transition"),
    note: z
      .string()
      .max(2000)
      .describe("Required reason when returning or approving"),
  }),
  run: async ({ id, version, status, note }) => {
    const access = await orderAccess(id);
    const user = access.user;
    return getDb().transaction(async (db) => {
      const [order] = await db
        .select()
        .from(schema.pmrOrders)
        .where(eq(schema.pmrOrders.id, id))
        .for("update");
      if (!order) fail("Work order not found.", { statusCode: 404 });
      if (status === "Submitted") {
        if (
          order.assignee !== user.email ||
          !["In progress", "Returned"].includes(order.status)
        )
          fail("Only the assigned technician can submit an active visit.", {
            statusCode: 409,
          });
        const [results, photos] = await Promise.all([
          db
            .select()
            .from(schema.pmrResults)
            .where(eq(schema.pmrResults.orderId, id))
            .limit(3000),
          db
            .select()
            .from(schema.pmrEvidence)
            .where(eq(schema.pmrEvidence.orderId, id))
            .limit(1000),
        ]);
        for (const group of order.checklist)
          for (let n = 1; n <= (order.inventory[group.id] ?? 1); n++)
            for (const etl of group.etls) {
              const result = results.find(
                (r) => r.etlCode === etl.code && r.instance === String(n),
              );
              if (
                !result ||
                ["Incomplete", "Not tested"].includes(result.status)
              )
                fail(
                  `Complete ${etl.code}, instance ${n}, before submission.`,
                  { statusCode: 409 },
                );
              if (
                result.status !== "Not applicable" &&
                !photos.some(
                  (p) =>
                    p.instance === String(n) &&
                    p.linkedEtls.includes(etl.code) &&
                    p.state === "Accepted" &&
                    !p.findings.some((f) => f.severity === "block"),
                )
              )
                fail(
                  `Accepted evidence is missing for ${etl.code}, instance ${n}.`,
                  { statusCode: 409 },
                );
            }
      } else {
        requireRole(user, "admin", "supervisor");
        if (
          !user.regions.includes(order.region) ||
          order.status !== "Submitted"
        )
          fail("Only submitted work in your region can be reviewed.", {
            statusCode: 409,
          });
        if (!note.trim())
          fail("Add a review explanation.", { statusCode: 400 });
      }
      const [row] = await db
        .update(schema.pmrOrders)
        .set({
          status,
          reviewNote: note,
          version: version + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(schema.pmrOrders.id, id),
            eq(schema.pmrOrders.version, version),
          ),
        )
        .returning({ id: schema.pmrOrders.id });
      if (!row)
        fail("Work order changed. Refresh and retry.", { statusCode: 409 });
      await db
        .insert(schema.pmrAudit)
        .values({
          id: crypto.randomUUID(),
          ownerEmail: user.email,
          orgId: user.orgId,
          orderId: id,
          event: status,
          detail: note || "Technician submitted visit",
          createdAt: new Date().toISOString(),
        });
      return { id };
    });
  },
});
