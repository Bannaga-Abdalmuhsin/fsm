import { describe, expect, it } from "vitest";

import {
  canAssignOrder,
  canOperateOrder,
  canReviewEvidence,
  canViewOrder,
  scopeOrders,
  type Member,
  type ScopedOrder,
} from "./access";

const org = "org-1";
const tech: Member = {
  ownerEmail: "tech@example.com",
  orgId: org,
  role: "technician",
  regions: ["CR"],
};
const supervisor: Member = {
  ...tech,
  ownerEmail: "sup@example.com",
  role: "supervisor",
};
const admin: Member = {
  ...tech,
  ownerEmail: "admin@example.com",
  role: "admin",
  regions: ["CR", "ER"],
};

const mine: ScopedOrder = {
  assignee: "TECH@example.com",
  orgId: org,
  region: "CR",
};
const someoneElses: ScopedOrder = {
  assignee: "other@example.com",
  orgId: org,
  region: "CR",
};
const otherRegion: ScopedOrder = {
  assignee: "tech@example.com",
  orgId: org,
  region: "WR",
};
const otherOrg: ScopedOrder = {
  assignee: "tech@example.com",
  orgId: "org-2",
  region: "CR",
};

describe("technician scope", () => {
  it("sees only work orders assigned to them within their regions", () => {
    expect(canViewOrder(tech, mine)).toBe(true);
    expect(canViewOrder(tech, someoneElses)).toBe(false);
    expect(canViewOrder(tech, otherRegion)).toBe(false);
    expect(canViewOrder(tech, otherOrg)).toBe(false);
  });

  it("can operate only on their own assigned work orders", () => {
    expect(canOperateOrder(tech, mine)).toBe(true);
    expect(canOperateOrder(tech, someoneElses)).toBe(false);
  });

  it("cannot assign or review", () => {
    expect(canAssignOrder(tech, mine)).toBe(false);
    expect(canReviewEvidence(tech, mine)).toBe(false);
  });
});

describe("supervisor and admin scope", () => {
  it("sees every order in their regions, not just their own", () => {
    expect(canViewOrder(supervisor, someoneElses)).toBe(true);
    expect(canViewOrder(supervisor, otherRegion)).toBe(false);
  });

  it("can assign and review within scope, never across orgs", () => {
    expect(canAssignOrder(supervisor, someoneElses)).toBe(true);
    expect(canReviewEvidence(admin, someoneElses)).toBe(true);
    expect(canAssignOrder(admin, otherOrg)).toBe(false);
    expect(canReviewEvidence(admin, otherRegion)).toBe(false);
  });

  it("does not gain operating rights over orders assigned to others", () => {
    expect(canOperateOrder(supervisor, someoneElses)).toBe(false);
  });
});

describe("scopeOrders", () => {
  it("filters a mixed list down to the visible set", () => {
    const all = [mine, someoneElses, otherRegion, otherOrg];
    expect(scopeOrders(tech, all)).toEqual([mine]);
    expect(scopeOrders(supervisor, all)).toEqual([mine, someoneElses]);
  });
});

describe('regional office role boundaries',()=>{it('scopes team leaders to exact teams and regions',()=>{const m:Member={...supervisor,role:'team_leader',teams:['Team A']};expect(canViewOrder(m,{...someoneElses,team:'Team A'})).toBe(true);expect(canViewOrder(m,{...someoneElses,team:'Team B'})).toBe(false);expect(canAssignOrder(m,{...someoneElses,team:'Team A'})).toBe(false)});it('allows FSM regional visibility but no review or scheduling',()=>{const m:Member={...supervisor,role:'fsm_team'};expect(canViewOrder(m,someoneElses)).toBe(true);expect(canViewOrder(m,otherRegion)).toBe(false);expect(canReviewEvidence(m,someoneElses)).toBe(false);expect(canAssignOrder(m,someoneElses)).toBe(false)})});
