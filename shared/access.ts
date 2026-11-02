export const roles = ["admin", "supervisor", "technician"] as const;
export type Role = (typeof roles)[number];

export type Member = {
  ownerEmail: string;
  orgId: string | null;
  role: Role;
  regions: string[];
};

export type ScopedOrder = {
  assignee: string;
  orgId: string | null;
  region: string;
};

const normalize = (email: string) => email.trim().toLowerCase();

function sameOrg(member: Member, order: ScopedOrder) {
  return (member.orgId ?? "") === (order.orgId ?? "");
}

function inRegion(member: Member, order: ScopedOrder) {
  return member.regions.includes(order.region);
}

function isAssignee(member: Member, order: ScopedOrder) {
  return normalize(order.assignee) === normalize(member.ownerEmail);
}

export function canManage(member: Member) {
  return member.role === "admin" || member.role === "supervisor";
}

export function canViewOrder(member: Member, order: ScopedOrder) {
  if (!sameOrg(member, order) || !inRegion(member, order)) return false;
  return canManage(member) || isAssignee(member, order);
}

export function canAssignOrder(member: Member, order: ScopedOrder) {
  return canManage(member) && canViewOrder(member, order);
}

export function canOperateOrder(member: Member, order: ScopedOrder) {
  return canViewOrder(member, order) && isAssignee(member, order);
}

export function canReviewEvidence(member: Member, order: ScopedOrder) {
  return canManage(member) && canViewOrder(member, order);
}

export function scopeOrders<T extends ScopedOrder>(
  member: Member,
  orders: T[],
) {
  return orders.filter((order) => canViewOrder(member, order));
}
