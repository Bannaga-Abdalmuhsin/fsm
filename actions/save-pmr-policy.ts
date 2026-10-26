import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, isNull, desc } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db";
import { identity, requireRole, audit } from "../server/pmr/access";
import { defaultPolicy } from "../shared/pmr";
export default defineAction({
  description:
    "Publish a new PMR quality-scoring policy; existing work orders retain their snapshots.",
  schema: z.object({
    weights: z
      .object({
        clarity: z.number().min(0).max(100),
        coverage: z.number().min(0).max(100),
        integrity: z.number().min(0).max(100),
        location: z.number().min(0).max(100),
        time: z.number().min(0).max(100),
      })
      .describe("Dimension weights totaling 100"),
    pass: z.number().min(1).max(100).describe("Pass threshold"),
    review: z.number().min(0).max(99).describe("Review threshold below pass"),
  }),
  run: async (args) => {
    const user = await identity();
    requireRole(user, "admin");
    if (
      Object.values(args.weights).reduce((a, b) => a + b, 0) !== 100 ||
      args.review >= args.pass
    )
      fail("Weights must total 100; review must be below pass.", {
        statusCode: 400,
      });
    const db = getDb();
    const scope = user.orgId
      ? eq(schema.pmrPolicies.orgId, user.orgId)
      : and(
          isNull(schema.pmrPolicies.orgId),
          eq(schema.pmrPolicies.ownerEmail, user.email),
        );
    const [previous] = await db
      .select()
      .from(schema.pmrPolicies)
      .where(scope)
      .orderBy(desc(schema.pmrPolicies.createdAt))
      .limit(1);
    const policy = {
      ...defaultPolicy,
      ...args,
      version: (previous?.policy.version ?? 1) + 1,
    };
    const [row] = await db
      .insert(schema.pmrPolicies)
      .values({
        id: crypto.randomUUID(),
        ownerEmail: user.email,
        orgId: user.orgId,
        policy,
        createdAt: new Date().toISOString(),
      })
      .returning();
    await audit(
      user,
      "configuration",
      "Policy published",
      `Version ${policy.version}`,
    );
    return { id: row.id, policy };
  },
});
