import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { loadWorkOrder, recordAudit, requireStaff } from "../server/lib/pmr.js";

export default defineAction({
  description:
    "Admin assigns a work order to a technician account, or unassigns it. Site coordinates are not editable here.",
  schema: z.object({
    workOrderId: z.string(),
    technicianEmail: z.string().email().nullable(),
  }),
  run: async ({ workOrderId, technicianEmail }) => {
    const staff = await requireStaff([]);
    const order = await loadWorkOrder(workOrderId);
    const db = getDb();
    if (technicianEmail) {
      const [member] = await db
        .select()
        .from(schema.staffMembers)
        .where(
          and(
            eq(schema.staffMembers.email, technicianEmail),
            eq(schema.staffMembers.role, "technician"),
          ),
        )
        .limit(1);
      if (!member) fail("Assign only to an account with the technician role.", { statusCode: 422 });
    }
    await db
      .update(schema.workOrders)
      .set({ technicianEmail })
      .where(eq(schema.workOrders.id, order.id));
    await recordAudit({
      workOrderId: order.id,
      entityType: "work_order",
      entityId: order.id,
      eventType: "assignment_changed",
      actorEmail: staff.email,
      message: technicianEmail
        ? `Assigned to ${technicianEmail}.`
        : "Unassigned.",
    });
    const [row] = await db
      .select()
      .from(schema.workOrders)
      .where(eq(schema.workOrders.id, order.id))
      .limit(1);
    return row;
  },
});
