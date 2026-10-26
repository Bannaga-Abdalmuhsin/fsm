import { defineAction } from "@agent-native/core/action";
import { desc } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { requireStaff } from "../server/lib/pmr.js";

export default defineAction({
  description:
    "Admin overview: staff with roles, work orders with assignments, and gallery approvals.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    await requireStaff([]);
    const db = getDb();
    const staff = await db
      .select()
      .from(schema.staffMembers)
      .orderBy(schema.staffMembers.name);
    const workOrders = await db
      .select()
      .from(schema.workOrders)
      .orderBy(schema.workOrders.reference);
    const approvals = await db
      .select()
      .from(schema.galleryApprovals)
      .orderBy(desc(schema.galleryApprovals.createdAt));
    return { staff, workOrders, approvals };
  },
});
