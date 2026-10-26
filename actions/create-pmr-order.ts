import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, isNull, desc } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db";
import { identity, requireRole, audit } from "../server/pmr/access";
import { checklists } from "../shared/checklists";
import { defaultPolicy, regionSchema, siteTypeSchema } from "../shared/pmr";
const instant = z.string().datetime({ offset: true });
export default defineAction({
  description:
    "Schedule a PMR work order with site, assignee, TCN window and frozen checklist/policy.",
  schema: z.object({
    siteId: z.string().trim().min(1).max(80).describe("Registered site ID"),
    siteType: siteTypeSchema.describe("ODU or SHELTER"),
    region: regionSchema.describe("CR, ER, WR or SR"),
    team: z.string().trim().min(1).max(80).describe("Field team"),
    assignee: z.email().describe("Assigned technician email"),
    wo: z.string().trim().min(1).max(80).describe("Unique work order number"),
    tcn: z.string().trim().min(1).max(80).describe("TCN ticket number"),
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .describe("PMR month YYYY-MM"),
    latitude: z.number().min(-90).max(90).describe("Registered site latitude"),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe("Registered site longitude"),
    scheduledStart: instant.describe("Visit start ISO 8601 with offset"),
    scheduledEnd: instant.describe("Visit end ISO 8601 with offset"),
    tcnStart: instant.describe("Authorized TCN start ISO 8601 with offset"),
    tcnEnd: instant.describe("Authorized TCN end ISO 8601 with offset"),
    inventory: z
      .record(z.string(), z.number().int().min(1).max(20))
      .describe("Group ID to equipment instance count; default one per group"),
  }),
  run: async (args) => {
    const user = await identity();
    requireRole(user, "admin", "supervisor");
    if (!user.regions.includes(args.region))
      fail("Region is outside your scope.", { statusCode: 403 });
    if (
      Date.parse(args.scheduledEnd) <= Date.parse(args.scheduledStart) ||
      Date.parse(args.tcnEnd) <= Date.parse(args.tcnStart)
    )
      fail("End times must be after start times.", { statusCode: 400 });
    if (
      Date.parse(args.scheduledStart) < Date.parse(args.tcnStart) ||
      Date.parse(args.scheduledEnd) > Date.parse(args.tcnEnd)
    )
      fail("Schedule must be within the authorized TCN window.", {
        statusCode: 400,
      });
    const db = getDb();
    const scope = user.orgId
      ? eq(schema.pmrPolicies.orgId, user.orgId)
      : and(
          isNull(schema.pmrPolicies.orgId),
          eq(schema.pmrPolicies.ownerEmail, user.email),
        );
    const [saved] = await db
      .select()
      .from(schema.pmrPolicies)
      .where(scope)
      .orderBy(desc(schema.pmrPolicies.createdAt))
      .limit(1);
    const exists = await db
      .select({ id: schema.pmrOrders.id })
      .from(schema.pmrOrders)
      .where(
        and(
          eq(schema.pmrOrders.wo, args.wo),
          user.orgId
            ? eq(schema.pmrOrders.orgId, user.orgId)
            : eq(schema.pmrOrders.ownerEmail, user.email),
        ),
      )
      .limit(1);
    if (exists.length)
      fail("This work order already exists.", { statusCode: 409 });
    const now = new Date().toISOString();
    const [row] = await db
      .insert(schema.pmrOrders)
      .values({
        ...args,
        assignee: args.assignee.toLowerCase(),
        id: crypto.randomUUID(),
        ownerEmail: user.email,
        orgId: user.orgId,
        checklist: checklists[args.siteType],
        policy: saved?.policy ?? defaultPolicy,
        createdAt: now,
        updatedAt: now,
        status: "Assigned",
        scheduledStart: new Date(args.scheduledStart).toISOString(),
        scheduledEnd: new Date(args.scheduledEnd).toISOString(),
        tcnStart: new Date(args.tcnStart).toISOString(),
        tcnEnd: new Date(args.tcnEnd).toISOString(),
      })
      .returning();
    await audit(user, row.id, "Scheduled", `WO ${row.wo}; TCN ${row.tcn}`);
    return { id: row.id };
  },
});
