if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("pglite:"))
  throw new Error("Smoke scripts require an isolated local PGlite database.");
import { strict as assert } from "node:assert";

import { runWithRequestContext } from "@agent-native/core/server";
import { eq } from "drizzle-orm";

import checkin from "../actions/check-in-pmr";
import createOrder from "../actions/create-pmr-order";
import saveResult from "../actions/save-pmr-result";
import submit from "../actions/update-pmr-order";
import { getDb, schema } from "../server/db";
import { orderAccess } from "../server/pmr/access";
import { checklists } from "../shared/checklists";
const email = "pmr-smoke@example.invalid",
  orgId = "pmr-smoke-org";
const context = { userEmail: email, orgId };
const db = getDb();
await db.insert(schema.pmrMembers).values({
  id: crypto.randomUUID(),
  ownerEmail: email,
  orgId,
  role: "admin",
  regions: ["CR"],
});
let orderId = "";
try {
  await runWithRequestContext(context, async () => {
    const now = Date.now();
    const input = {
      siteId: "SYNTHETIC-TEST",
      siteType: "ODU" as const,
      region: "CR" as const,
      team: "Isolated test",
      assignee: email,
      wo: `SMOKE-${now}`,
      tcn: "SYNTHETIC-TCN",
      month: "2026-10",
      latitude: 24.7,
      longitude: 46.7,
      scheduledStart: new Date(now - 3600000).toISOString(),
      scheduledEnd: new Date(now + 3600000).toISOString(),
      tcnStart: new Date(now - 3600000).toISOString(),
      tcnEnd: new Date(now + 3600000).toISOString(),
      inventory: {},
    };
    const row = await createOrder.run(input);
    orderId = row.id;
    assert.ok(orderId);
    await assert.rejects(
      () => Promise.resolve(createOrder.run(input)),
      /already exists/,
    );
    const before = await orderAccess(orderId);
    assert.equal(before.order.checklist.flatMap((g) => g.etls).length, 67);
    await assert.rejects(
      () =>
        Promise.resolve(
          checkin.run({
            id: orderId,
            gps: {
              latitude: 25,
              longitude: 46.7,
              accuracy: 5,
              timestamp: new Date().toISOString(),
            },
          }),
        ),
      /250 m/,
    );
    await checkin.run({
      id: orderId,
      gps: {
        latitude: 24.7,
        longitude: 46.7,
        accuracy: 5,
        timestamp: new Date().toISOString(),
      },
    });
    await saveResult.run({
      id: orderId,
      gps: {
        latitude: 24.7,
        longitude: 46.7,
        accuracy: 5,
        timestamp: new Date().toISOString(),
      },
      etlCode: "COW ODU_MONTHLY_ONSITE_2",
      instance: "1",
      status: "Pass",
      remarks: "Synthetic test",
      readings: "",
      tt: "",
      noc: "",
    });
    await assert.rejects(
      () =>
        Promise.resolve(
          submit.run({
            id: orderId,
            version: 1,
            status: "Submitted",
            note: "",
          }),
        ),
      /Complete/,
    );
  });
  await runWithRequestContext(
    { userEmail: "outsider@example.invalid", orgId },
    async () => {
      await assert.rejects(() => orderAccess(orderId), /role/);
    },
  );
  for (const [type, count] of [
    ["ODU", 67],
    ["SHELTER", 144],
  ] as const) {
    const ids = checklists[type].flatMap((g) => g.etls.map((e) => e.number));
    assert.equal(ids.length, count);
    assert.equal(new Set(ids).size, count);
    for (let n = 1; n <= count; n++) assert.ok(ids.includes(n));
  }
  console.log(
    "PASS: both complete catalogues, persisted create/read, duplicate WO rejection, geofence rejection, valid check-in, saved result, incomplete submission rejection and unassigned-user denial.",
  );
} finally {
  if (orderId) {
    await db
      .delete(schema.pmrResults)
      .where(eq(schema.pmrResults.orderId, orderId));
    await db
      .delete(schema.pmrAudit)
      .where(eq(schema.pmrAudit.orderId, orderId));
    await db.delete(schema.pmrOrders).where(eq(schema.pmrOrders.id, orderId));
  }
  await db
    .delete(schema.pmrMembers)
    .where(eq(schema.pmrMembers.ownerEmail, email));
}
process.exit(0);
