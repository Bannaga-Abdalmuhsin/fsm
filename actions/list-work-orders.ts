import { defineAction } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { requireStaff } from "../server/lib/pmr.js";

export default defineAction({
  description:
    "List PMR work orders. Technicians see only orders assigned to them; supervisors and admins see all.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const staff = await requireStaff(["technician", "supervisor"]);
    const db = getDb();
    const query = db.select().from(schema.workOrders);
    const rows =
      staff.role === "technician"
        ? await query
            .where(eq(schema.workOrders.technicianEmail, staff.email))
            .orderBy(asc(schema.workOrders.reference))
        : await query.orderBy(asc(schema.workOrders.reference));
    return rows;
  },
});
