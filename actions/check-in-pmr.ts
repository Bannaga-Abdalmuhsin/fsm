import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db";
import { orderAccess, audit } from "../server/pmr/access";
import { geoSchema, locationGate, captureTimeGate } from "../shared/pmr";
export default defineAction({
  description:
    "Check into the assigned PMR visit after server-side 250 m geofence and TCN checks.",
  schema: z.object({
    id: z.string().uuid().describe("Work order UUID"),
    gps: geoSchema.describe("Fresh device location and measured accuracy"),
  }),
  run: async ({ id, gps }) => {
    const { user, order } = await orderAccess(id, true);
    if (order.assignee !== user.email)
      fail("Only the assigned technician can check in.", { statusCode: 403 });
    const now = new Date().toISOString();
    const gate = locationGate(gps, order, Date.now(), order.policy);
    const reason =
      gate.reason ?? captureTimeGate(now, order.tcnStart, order.tcnEnd, now);
    if (reason) {
      await audit(user, id, "Check-in rejected", reason);
      fail(reason, { statusCode: 409 });
    }
    if (order.checkedInAt) return { id, checkedInAt: order.checkedInAt };
    await getDb()
      .update(schema.pmrOrders)
      .set({
        checkedInAt: now,
        checkIn: gps,
        status: "In progress",
        updatedAt: now,
      })
      .where(eq(schema.pmrOrders.id, id));
    await audit(
      user,
      id,
      "Checked in",
      `${gate.distance} m; accuracy ${gps.accuracy} m (device-reported)`,
    );
    return { id, checkedInAt: now };
  },
});
