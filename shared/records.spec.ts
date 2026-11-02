import { describe, expect, it } from "vitest";

import { defaultPolicy } from "./pmr";
import { newOrderSchema, toEvidence, toMember, toOrder } from "./records";

const orderRow = {
  id: "o-1",
  owner_email: "admin@example.com",
  org_id: "org-1",
  site_id: "CR-001",
  site_type: "ODU",
  region: "CR",
  team: "Team A",
  assignee: "tech@example.com",
  wo: "WO-1",
  tcn: "TCN-1",
  month: "2026-10",
  latitude: 24.7,
  longitude: 46.7,
  scheduled_start: "2026-10-27T06:00:00.000Z",
  scheduled_end: "2026-10-27T10:00:00.000Z",
  tcn_start: "2026-10-27T06:00:00.000Z",
  tcn_end: "2026-10-27T10:00:00.000Z",
  status: "Assigned",
  checked_in_at: null,
  check_in: null,
  inventory: {},
  checklist: [
    {
      id: "g1",
      title: "Group",
      etls: [
        {
          number: 1,
          code: "ETL-1",
          description: "d",
          source: "s",
          requiresClarification: false,
        },
      ],
    },
  ],
  policy: defaultPolicy,
  version: 1,
  created_at: "2026-10-26T00:00:00.000Z",
  updated_at: "2026-10-26T00:00:00.000Z",
  review_note: "",
};

describe("toOrder", () => {
  it("maps snake_case columns to the app shape", () => {
    const order = toOrder(orderRow);
    expect(order.siteId).toBe("CR-001");
    expect(order.tcnStart).toBe(orderRow.tcn_start);
    expect(order.checklist[0].etls[0].code).toBe("ETL-1");
  });

  it("rejects rows that do not match the existing schema", () => {
    expect(() => toOrder({ ...orderRow, site_type: "TOWER" })).toThrow();
    expect(() => toOrder({ ...orderRow, wo: undefined })).toThrow();
  });
});

describe("toMember", () => {
  it("maps membership and rejects unknown roles", () => {
    const member = toMember({
      owner_email: "tech@example.com",
      org_id: "org-1",
      role: "technician",
      regions: ["CR"],
    });
    expect(member).toEqual({
      ownerEmail: "tech@example.com",
      orgId: "org-1",
      role: "technician",
      regions: ["CR"],
    });
    expect(() =>
      toMember({
        owner_email: "x@example.com",
        org_id: null,
        role: "owner",
        regions: [],
      }),
    ).toThrow();
  });
});

describe("toEvidence", () => {
  it("requires a storage handle and GPS fix", () => {
    const row = {
      id: "e-1",
      order_id: "o-1",
      group_id: "g1",
      instance: "1",
      captured_at: "2026-10-27T06:10:00.000Z",
      uploaded_at: "2026-10-27T06:10:05.000Z",
      gps: {
        latitude: 24.7,
        longitude: 46.7,
        accuracy: 5,
        timestamp: "2026-10-27T06:10:00.000Z",
      },
      sha: "abc",
      handle: { bucket: "pmr-evidence", path: "org-1/o-1/e-1.jpg" },
      state: "Pending analysis",
      linked_etls: [1],
      review_note: "",
      revision: 1,
    };
    expect(toEvidence(row).path).toBe("org-1/o-1/e-1.jpg");
    expect(() => toEvidence({ ...row, handle: {} })).toThrow();
  });
});

describe("newOrderSchema", () => {
  const valid = {
    siteId: "CR-001",
    siteType: "ODU",
    region: "CR",
    team: "Team A",
    wo: "WO-1",
    tcn: "TCN-1",
    month: "2026-10",
    latitude: 24.7,
    longitude: 46.7,
    scheduledStart: "2026-10-27T06:00:00+03:00",
    scheduledEnd: "2026-10-27T10:00:00+03:00",
    tcnStart: "2026-10-27T06:00:00+03:00",
    tcnEnd: "2026-10-27T10:00:00+03:00",
    assignee: "tech@example.com",
  };

  it("accepts a complete work order", () => {
    expect(newOrderSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an inverted TCN window and a bad assignee", () => {
    expect(
      newOrderSchema.safeParse({
        ...valid,
        tcnEnd: "2026-10-27T05:00:00+03:00",
      }).success,
    ).toBe(false);
    expect(
      newOrderSchema.safeParse({ ...valid, assignee: "not-an-email" }).success,
    ).toBe(false);
  });
});
