import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db";
import { orderAccess, requireRole, audit } from "../server/pmr/access";
export default defineAction({
  description:
    "Admin grant or revoke a scoped, expiring gallery exception for one PMR work order.",
  schema: z.object({
    id: z.string().uuid().describe("Work order UUID"),
    approvalId: z
      .string()
      .uuid()
      .optional()
      .describe("Existing approval to revoke; omit to grant"),
    groups: z.array(z.string()).min(1).max(28).describe("Evidence group IDs"),
    reason: z
      .string()
      .min(5)
      .max(1000)
      .describe("Why direct capture is unavailable"),
    expiresAt: z
      .string()
      .datetime({ offset: true })
      .describe("Approval expiry ISO 8601 with offset"),
    maxImages: z
      .number()
      .int()
      .min(1)
      .max(50)
      .describe("Maximum imported images"),
  }),
  run: async ({ id, approvalId, ...args }) => {
    const { user, order } = await orderAccess(id);
    requireRole(user, "admin");
    if (!user.regions.includes(order.region))
      fail("Region is outside your scope.", { statusCode: 403 });
    if (args.groups.some((g) => !order.checklist.some((x) => x.id === g)))
      fail("Unknown evidence group.", { statusCode: 400 });
    if (approvalId) {
      const [row] = await getDb()
        .select()
        .from(schema.pmrApprovals)
        .where(eq(schema.pmrApprovals.id, approvalId))
        .limit(1);
      if (!row || row.orderId !== id)
        fail("Approval not found.", { statusCode: 404 });
      await getDb()
        .update(schema.pmrApprovals)
        .set({ revokedAt: new Date().toISOString() })
        .where(eq(schema.pmrApprovals.id, approvalId));
      await audit(user, id, "Gallery approval revoked", approvalId);
      return { id: approvalId };
    }
    if (Date.parse(args.expiresAt) <= Date.now())
      fail("Expiry must be in the future.", { statusCode: 400 });
    const [row] = await getDb()
      .insert(schema.pmrApprovals)
      .values({
        id: crypto.randomUUID(),
        ownerEmail: user.email,
        orgId: user.orgId,
        orderId: id,
        technician: order.assignee,
        ...args,
      })
      .returning();
    await audit(
      user,
      id,
      "Gallery approval granted",
      `${row.id}; ${args.maxImages} images; ${args.reason}`,
    );
    return { id: row.id };
  },
});
