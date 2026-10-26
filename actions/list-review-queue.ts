import { defineAction } from "@agent-native/core/action";
import { desc, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { requireStaff } from "../server/lib/pmr.js";

export default defineAction({
  description:
    "List evidence awaiting a supervisor decision (supervisor review or pending analysis), with findings, task, and work order references.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    await requireStaff(["supervisor"]);
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.evidence)
      .where(
        inArray(schema.evidence.decision, ["supervisor_review", "pending_analysis"]),
      )
      .orderBy(desc(schema.evidence.uploadedAt));
    if (rows.length === 0) return [];

    const findings = await db
      .select()
      .from(schema.evidenceFindings)
      .where(
        inArray(
          schema.evidenceFindings.evidenceId,
          rows.map((row) => row.id),
        ),
      );
    const orders = await db.select().from(schema.workOrders);
    const tasks = await db
      .select()
      .from(schema.captureTasks)
      .where(
        inArray(
          schema.captureTasks.workOrderId,
          orders.map((order) => order.id),
        ),
      );

    return rows.map((row) => {
      const order = orders.find((o) => o.id === row.workOrderId);
      const task = tasks.find((t) => t.id === row.taskId);
      return {
        ...row,
        findings: findings.filter((f) => f.evidenceId === row.id),
        workOrderReference: order?.reference ?? "",
        taskTitle: task?.title ?? "",
        expectedEquipment: task?.expectedEquipment ?? "",
        requiredDetails: task?.requiredDetails ?? "",
      };
    });
  },
});
