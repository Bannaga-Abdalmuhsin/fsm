import { eq, and, isNull } from "drizzle-orm";

import { getDb, schema } from "../server/db";
const args: Record<string, string> = Object.fromEntries(
  process.argv.slice(2).map((x) => x.split("=")),
);
const email = args.email?.toLowerCase(),
  role = args.role,
  orgId = args.org ?? null,
  regions = (args.regions ?? "").split(",").filter(Boolean);
if (
  !email?.includes("@") ||
  !["admin", "supervisor", "technician"].includes(role) ||
  !regions.length ||
  regions.some((r: string) => !["CR", "ER", "WR", "SR"].includes(r))
)
  throw new Error(
    "Usage: pnpm exec tsx scripts/provision-pmr.ts email=verified-address role=admin|supervisor|technician regions=CR,ER org=existing-org-id (omit org for personal scope)",
  );
const db = getDb();
const existing = await db
  .select()
  .from(schema.pmrMembers)
  .where(
    and(
      eq(schema.pmrMembers.ownerEmail, email),
      orgId
        ? eq(schema.pmrMembers.orgId, orgId)
        : isNull(schema.pmrMembers.orgId),
    ),
  )
  .limit(1);
if (existing.length) {
  await db
    .update(schema.pmrMembers)
    .set({ role, regions })
    .where(eq(schema.pmrMembers.id, existing[0].id));
} else {
  await db
    .insert(schema.pmrMembers)
    .values({
      id: crypto.randomUUID(),
      ownerEmail: email,
      orgId,
      role,
      regions,
    });
}
console.log(
  "PMR membership provisioned. Verify the user has the matching authenticated organization context.",
);
process.exit(0);
