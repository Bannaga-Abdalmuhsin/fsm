import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { ROLES, recordAudit, requireStaff } from "../server/lib/pmr.js";

export default defineAction({
  description:
    "Admin creates or updates a staff account's role (technician, supervisor, or admin). Admins cannot demote themselves.",
  schema: z.object({
    email: z.string().email(),
    name: z.string().trim().min(1),
    role: z.enum(ROLES),
  }),
  run: async ({ email, name, role }) => {
    const staff = await requireStaff([]);
    if (email === staff.email && role !== "admin") {
      fail("You cannot remove your own admin role.", { statusCode: 422 });
    }
    const db = getDb();
    const [existing] = await db
      .select()
      .from(schema.staffMembers)
      .where(eq(schema.staffMembers.email, email))
      .limit(1);
    if (existing) {
      await db
        .update(schema.staffMembers)
        .set({ name, role })
        .where(eq(schema.staffMembers.email, email));
    } else {
      await db.insert(schema.staffMembers).values({
        email,
        name,
        role,
        createdAt: new Date().toISOString(),
      });
    }
    await recordAudit({
      entityType: "staff",
      entityId: email,
      eventType: "role_changed",
      actorEmail: staff.email,
      message: `${email} set to ${role}.`,
    });
    const [row] = await db
      .select()
      .from(schema.staffMembers)
      .where(eq(schema.staffMembers.email, email))
      .limit(1);
    return row;
  },
});
