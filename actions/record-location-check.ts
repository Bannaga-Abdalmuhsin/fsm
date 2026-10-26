import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import {
  assessLocation,
  canActOnWorkOrder,
  loadWorkOrder,
  locationIntegrityFlags,
  recordAudit,
  requireStaff,
  TIMESTAMP_TOLERANCE_MS,
} from "../server/lib/pmr.js";

export default defineAction({
  description:
    "Validate the technician's GPS fix against the registered site (250 m geofence). Use purpose 'open', 'check_in', or 'capture'. Check-in is recorded only inside the authorized TCN window.",
  schema: z.object({
    workOrderId: z.string(),
    purpose: z.enum(["open", "check_in", "capture"]),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).describe("GPS accuracy radius in metres"),
    positionTimestamp: z.number().describe("Epoch ms of the GPS fix"),
    clientSentAt: z.string().datetime(),
  }),
  run: async (input) => {
    const staff = await requireStaff(["technician"]);
    const order = await loadWorkOrder(input.workOrderId);
    if (!canActOnWorkOrder(staff, order)) {
      fail("This work order is not assigned to you.", { statusCode: 403 });
    }

    const assessment = assessLocation(
      {
        siteLatitude: order.siteLatitude,
        siteLongitude: order.siteLongitude,
      },
      {
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy: input.accuracy,
      },
    );
    const clientTime = Date.parse(input.clientSentAt);
    const flags = locationIntegrityFlags({
      accuracy: input.accuracy,
      positionAgeMs: clientTime - input.positionTimestamp,
    });
    if (Math.abs(Date.now() - clientTime) > TIMESTAMP_TOLERANCE_MS) {
      flags.push("Device clock disagrees with server time.");
    }

    const now = new Date();
    const windowOpen =
      now >= new Date(order.tcnStart) && now <= new Date(order.tcnEnd);
    let checkedInAt = order.checkedInAt;
    let reason = assessment.reason;
    let checkedIn = false;
    if (input.purpose === "check_in") {
      if (assessment.outcome !== "inside") {
        reason = `Check-in requires being inside the geofence. ${assessment.reason}`;
      } else if (!windowOpen) {
        reason =
          "Check-in is blocked outside the authorized TCN window for this work order.";
      } else {
        checkedIn = true;
        if (!checkedInAt) {
          checkedInAt = now.toISOString();
          const db = getDb();
          await db
            .update(schema.workOrders)
            .set({ checkedInAt, status: "in_progress" })
            .where(eq(schema.workOrders.id, order.id));
        }
      }
    }

    await recordAudit({
      workOrderId: order.id,
      entityType: "work_order",
      entityId: order.id,
      eventType: `location_${input.purpose}`,
      actorEmail: staff.email,
      message: `${assessment.outcome}: ${reason}${flags.length ? ` Flags: ${flags.join(" ")}` : ""}`,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracy,
      distanceMeters: assessment.distance,
    });

    return {
      outcome: assessment.outcome,
      distanceMeters: Math.round(assessment.distance),
      accuracyMeters: Math.round(input.accuracy),
      reason,
      flags,
      checkedIn,
      checkedInAt,
    };
  },
});
