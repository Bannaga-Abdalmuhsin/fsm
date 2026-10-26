import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db";
import { orderAccess, audit } from "../server/pmr/access";
import { geoSchema, locationGate } from "../shared/pmr";
export default defineAction({
  description:
    "Record one ETL result, measurements, NOC reference and corrective TT without inferring test success from a photo.",
  schema: z.object({
    id: z.string().uuid().describe("Work order UUID"),
    gps: geoSchema.describe("Fresh field location for this checklist update"),
    etlCode: z.string().max(100).describe("Full checklist ETL identifier"),
    instance: z.string().regex(/^\d+$/).describe("Equipment instance number"),
    status: z
      .enum(["Incomplete", "Pass", "Fail", "Not applicable", "Not tested"])
      .describe("Explicit technician result"),
    remarks: z
      .string()
      .max(4000)
      .describe("Notes; reason required for N/A or not tested"),
    readings: z
      .string()
      .max(6000)
      .describe("Measurements with units and equipment identifiers"),
    tt: z
      .string()
      .max(200)
      .describe("Corrective ticket reference or pending action"),
    noc: z
      .string()
      .max(2000)
      .describe(
        "NOC alarm ID, date/time, authorization and restoration record",
      ),
  }),
  run: async ({ id, gps, ...args }) => {
    const { user, order } = await orderAccess(id, true);
    if (order.assignee !== user.email)
      fail("Only the assigned technician can record field results.", {
        statusCode: 403,
      });
    if (!order.checkedInAt)
      fail("Check in at the site first.", { statusCode: 409 });
    const group = order.checklist.find((g) =>
      g.etls.some((e) => e.code === args.etlCode),
    );
    if (
      !group ||
      Number(args.instance) < 1 ||
      Number(args.instance) > (order.inventory[group.id] ?? 1)
    )
      fail("Unknown ETL or equipment instance.", { statusCode: 400 });
    if (
      ["Not applicable", "Not tested"].includes(args.status) &&
      !args.remarks.trim()
    )
      fail("A reason is required.", { statusCode: 400 });
    if (args.status === "Fail" && !args.tt.trim())
      fail("Add the corrective TT or describe the pending TT action.", {
        statusCode: 400,
      });
    if (
      group.etls.find((e) => e.code === args.etlCode)?.requiresClarification &&
      args.status === "Pass"
    )
      fail(
        "This source ETL is truncated. Clarify its complete requirement before passing it.",
        { statusCode: 409 },
      );
    const description = group.etls.find(
      (e) => e.code === args.etlCode,
    )!.description;
    if (args.status === "Pass") {
      if (
        /measure|readings?|voltage|voltages|specific gravity|\bSG\b|frequency|RPM|current limit|load sharing|humidity|temperature/i.test(
          description,
        ) &&
        !args.readings.trim()
      )
        fail(
          "Record the required readings with units and equipment identifiers.",
          { statusCode: 400 },
        );
      if (/NOC/i.test(description) && !args.noc.trim())
        fail("Record the NOC alarm/test reference and date/time.", {
          statusCode: 400,
        });
      if (
        /test|function|operation|retorqu|retighten|lubricate|leak|sound|noise|vibration/i.test(
          description,
        ) &&
        !args.remarks.trim()
      )
        fail("Record the performed check and observed result in remarks.", {
          statusCode: 400,
        });
    }
    const gate = locationGate(gps, order, Date.now(), order.policy);
    if (!gate.allowed) fail(gate.reason!, { statusCode: 409 });
    const now = new Date().toISOString();
    const row = await getDb().transaction(async (tx) => {
      const [parent] = await tx
        .select()
        .from(schema.pmrOrders)
        .where(eq(schema.pmrOrders.id, id))
        .for("update");
      if (!parent || ["Submitted", "Approved"].includes(parent.status))
        fail("Work order is locked for review.", { statusCode: 409 });
      const [saved] = await tx
        .insert(schema.pmrResults)
        .values({
          id: crypto.randomUUID(),
          ownerEmail: user.email,
          orgId: user.orgId,
          orderId: id,
          ...args,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            schema.pmrResults.orderId,
            schema.pmrResults.etlCode,
            schema.pmrResults.instance,
          ],
          set: { ...args, updatedAt: now },
        })
        .returning();
      return saved;
    });
    await audit(
      user,
      id,
      "ETL result",
      `${args.etlCode} / ${args.instance}: ${args.status}`,
    );
    return { id: row.id };
  },
});
