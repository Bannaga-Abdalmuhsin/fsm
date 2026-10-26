import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { loadWorkOrder, recordAudit, requireStaff } from "../server/lib/pmr.js";

export default defineAction({
  description:
    "Admin approves gallery uploads for one work order, one technician, specific evidence groups, a reason, an expiry, and a maximum image count. Quality, location, time, and duplicate gates still apply to every upload.",
  schema: z.object({
    workOrderId: z.string(),
    technicianEmail: z.string().email(),
    evidenceGroups: z
      .array(z.string().trim().min(1))
      .min(1)
      .describe("Evidence groups such as Rectifier, Batteries, MDB"),
    reason: z.string().trim().min(10),
    expiresAt: z.string().datetime(),
    maxImages: z.number().int().min(1).max(20),
  }),
  run: async (input) => {
    const staff = await requireStaff([]);
    await loadWorkOrder(input.workOrderId);
    if (Date.parse(input.expiresAt) <= Date.now()) {
      fail("Approval expiry must be in the future.", { statusCode: 422 });
    }
    const db = getDb();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const groups = [...new Set(input.evidenceGroups)].join(",");
    await db.insert(schema.galleryApprovals).values({
      id,
      workOrderId: input.workOrderId,
      technicianEmail: input.technicianEmail,
      evidenceGroups: groups,
      reason: input.reason,
      maxImages: input.maxImages,
      imagesUsed: 0,
      expiresAt: new Date(input.expiresAt).toISOString(),
      approvedByEmail: staff.email,
      createdAt: now,
    });
    await recordAudit({
      workOrderId: input.workOrderId,
      entityType: "gallery_approval",
      entityId: id,
      eventType: "gallery_approved",
      actorEmail: staff.email,
      message: `Gallery upload approved for ${input.technicianEmail} (${groups}), up to ${input.maxImages} image(s). Reason: ${input.reason}`,
    });
    const [row] = await db
      .select()
      .from(schema.galleryApprovals)
      .where(eq(schema.galleryApprovals.id, id))
      .limit(1);
    return row;
  },
});
