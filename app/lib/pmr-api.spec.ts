import type { Member } from "@shared/access";
import { checklists } from "@shared/checklists";
import { defaultPolicy, type Geo } from "@shared/pmr";
import type { Order } from "@shared/records";
import { describe, expect, it } from "vitest";

import {
  assignOrder,
  captureEvidence,
  checkInOrder,
  createOrder,
} from "./pmr-api";

const technician: Member = {
  ownerEmail: "tech@example.com",
  orgId: "org-1",
  role: "technician",
  regions: ["CR"],
};
const supervisor: Member = {
  ...technician,
  ownerEmail: "sup@example.com",
  role: "supervisor",
};

const order: Order = {
  id: "o-1",
  ownerEmail: "sup@example.com",
  orgId: "org-1",
  siteId: "CR-001",
  siteType: "ODU",
  region: "CR",
  team: "Team A",
  assignee: "tech@example.com",
  wo: "WO-1",
  tcn: "TCN-1",
  month: "2026-10",
  latitude: 24.7,
  longitude: 46.7,
  scheduledStart: "2026-10-27T06:00:00.000Z",
  scheduledEnd: "2026-10-27T10:00:00.000Z",
  tcnStart: "2026-10-27T06:00:00.000Z",
  tcnEnd: "2026-10-27T10:00:00.000Z",
  status: "Assigned",
  checkedInAt: null,
  checkIn: null,
  inventory: {},
  checklist: checklists.ODU,
  policy: defaultPolicy,
  version: 1,
  reviewNote: "",
  updatedAt: "2026-10-26T00:00:00.000Z",
};

const farFix: Geo = {
  latitude: 24.7 + 0.01,
  longitude: 46.7,
  accuracy: 5,
  timestamp: new Date().toISOString(),
};

const nearFix: Geo = { ...farFix, latitude: 24.7, longitude: 46.7 };

describe("client-side guards run before any Supabase call", () => {
  it("blocks technicians from creating or assigning work orders", async () => {
    await expect(
      createOrder(
        {
          siteId: "CR-001",
          siteType: "ODU",
          region: "CR",
          team: "Team A",
          wo: "WO-2",
          tcn: "TCN-2",
          month: "2026-10",
          latitude: 24.7,
          longitude: 46.7,
          scheduledStart: order.scheduledStart,
          scheduledEnd: order.scheduledEnd,
          tcnStart: order.tcnStart,
          tcnEnd: order.tcnEnd,
          assignee: "tech@example.com",
        },
        technician,
      ),
    ).rejects.toThrow(/Only supervisors/);
    await expect(
      assignOrder(order, "other@example.com", technician),
    ).rejects.toThrow(/cannot assign/);
  });

  it("blocks creating orders outside the supervisor's regions", async () => {
    await expect(
      createOrder(
        {
          siteId: "WR-001",
          siteType: "ODU",
          region: "WR",
          team: "Team A",
          wo: "WO-3",
          tcn: "TCN-3",
          month: "2026-10",
          latitude: 24.7,
          longitude: 46.7,
          scheduledStart: order.scheduledStart,
          scheduledEnd: order.scheduledEnd,
          tcnStart: order.tcnStart,
          tcnEnd: order.tcnEnd,
          assignee: "tech@example.com",
        },
        supervisor,
      ),
    ).rejects.toThrow(/outside your scope/);
  });

  it("refuses a check-in outside the 250 m boundary", async () => {
    await expect(checkInOrder(order, farFix, technician)).rejects.toThrow(
      /250 m/,
    );
  });

  it("refuses evidence capture before check-in", async () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    await expect(
      captureEvidence({
        order,
        member: technician,
        groupId: "g",
        etlNumber: 1,
        file,
        fix: nearFix,
        instance: "1",
      }),
    ).rejects.toThrow(/Check in/);
  });

  it("refuses work-order operations by someone not assigned to them", async () => {
    const other: Member = { ...technician, ownerEmail: "other@example.com" };
    await expect(
      checkInOrder({ ...order, checkIn: nearFix }, nearFix, other),
    ).rejects.toThrow(/not assigned/);
  });
});
