import { fail } from "@agent-native/core/action";
import {
  getRequestOrgId,
  getRequestUserEmail,
} from "@agent-native/core/server/request-context";
import { and, eq, isNull, or } from "drizzle-orm";

import { getDb, schema } from "../db";
export async function identity() {
  const email = getRequestUserEmail()?.toLowerCase();
  if (!email) fail("Sign in to continue.", { statusCode: 401 });
  const orgId = getRequestOrgId() ?? null;
  const [member] = await getDb()
    .select()
    .from(schema.pmrMembers)
    .where(
      and(
        eq(schema.pmrMembers.ownerEmail, email!),
        orgId
          ? eq(schema.pmrMembers.orgId, orgId)
          : isNull(schema.pmrMembers.orgId),
      ),
    )
    .limit(1);
  return {
    email: email!,
    orgId,
    role: member?.role ?? "unassigned",
    regions: member?.regions ?? [],
  };
}
export type Identity = Awaited<ReturnType<typeof identity>>;
export function requireRole(user: Identity, ...roles: string[]) {
  if (!roles.includes(user.role))
    fail("Your PMR role does not permit this action.", { statusCode: 403 });
}
export async function orderAccess(id: string, write = false) {
  const user = await identity();
  requireRole(user, "technician", "supervisor", "admin");
  const [order] = await getDb()
    .select()
    .from(schema.pmrOrders)
    .where(
      and(
        eq(schema.pmrOrders.id, id),
        user.orgId
          ? eq(schema.pmrOrders.orgId, user.orgId)
          : isNull(schema.pmrOrders.orgId),
      ),
    )
    .limit(1);
  if (!order) fail("Work order not found.", { statusCode: 404 });
  const assigned = order!.assignee === user.email;
  const manage =
    ["admin", "supervisor"].includes(user.role) &&
    user.regions.includes(order!.region) &&
    (user.orgId !== null || order!.ownerEmail === user.email);
  if (!assigned && !manage)
    fail("This work order is outside your assigned scope.", {
      statusCode: 403,
    });
  if (write && ["Submitted", "Approved"].includes(order!.status))
    fail("This work order is locked for review.", { statusCode: 409 });
  return { user, order: order! };
}
export function orderFilter(user: Identity) {
  const scoped = user.orgId
    ? eq(schema.pmrOrders.orgId, user.orgId)
    : isNull(schema.pmrOrders.orgId);
  const visibility =
    user.role === "technician"
      ? eq(schema.pmrOrders.assignee, user.email)
      : or(
          eq(schema.pmrOrders.assignee, user.email),
          ...user.regions.map((r) => eq(schema.pmrOrders.region, r)),
        );
  return and(
    scoped,
    user.orgId
      ? visibility
      : or(
          eq(schema.pmrOrders.assignee, user.email),
          eq(schema.pmrOrders.ownerEmail, user.email),
        ),
  );
}
export async function audit(
  user: Identity,
  orderId: string,
  event: string,
  detail: string,
) {
  await getDb()
    .insert(schema.pmrAudit)
    .values({
      id: crypto.randomUUID(),
      ownerEmail: user.email,
      orgId: user.orgId,
      orderId,
      event,
      detail: detail.slice(0, 4000),
      createdAt: new Date().toISOString(),
    });
}
