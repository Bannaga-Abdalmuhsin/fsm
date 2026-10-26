if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("pglite:"))
  throw new Error("Smoke scripts require an isolated local PGlite database.");
import { strict as assert } from "node:assert";

import {
  registerPrivateBlobProvider,
  unregisterPrivateBlobProvider,
  readPrivateBlob,
  type PrivateBlobHandle,
} from "@agent-native/core/private-blob";
import { runWithRequestContext } from "@agent-native/core/server";
import { eq } from "drizzle-orm";
import sharp from "sharp";

import checkin from "../actions/check-in-pmr";
import createOrder from "../actions/create-pmr-order";
import approveGallery from "../actions/manage-pmr-approval";
import { getDb, schema } from "../server/db";
import { storeEvidence } from "../server/pmr/upload";
const db = getDb(),
  email = "upload-smoke@example.invalid",
  orgId = "upload-smoke-org";
const blobs = new Map<string, Uint8Array>();
registerPrivateBlobProvider({
  id: "pmr-fixture-only",
  name: "In-memory test fixture only",
  isConfigured: () => true,
  put: async (input) => {
    const id = crypto.randomUUID();
    blobs.set(id, new Uint8Array(input.data));
    return {
      id,
      provider: "pmr-fixture-only",
      opaque: true,
      encrypted: false,
      mimeType: input.mimeType,
    };
  },
  read: async (handle) => ({ data: blobs.get(handle.id)!, handle }),
  delete: async (handle) => ({
    deleted: blobs.delete(handle.id),
    provider: "pmr-fixture-only",
  }),
});
await db.insert(schema.pmrMembers).values({
  id: crypto.randomUUID(),
  ownerEmail: email,
  orgId,
  role: "admin",
  regions: ["CR"],
});
let ids: string[] = [];
try {
  await runWithRequestContext({ userEmail: email, orgId }, async () => {
    const now = Date.now();
    const base = {
      siteId: "UPLOAD-FIXTURE",
      siteType: "ODU" as const,
      region: "CR" as const,
      team: "Synthetic",
      assignee: email,
      tcn: "TEST-TCN",
      month: "2026-10",
      latitude: 24.7,
      longitude: 46.7,
      scheduledStart: new Date(now - 3600000).toISOString(),
      scheduledEnd: new Date(now + 3600000).toISOString(),
      tcnStart: new Date(now - 3600000).toISOString(),
      tcnEnd: new Date(now + 3600000).toISOString(),
      inventory: {},
    };
    const first = await createOrder.run({ ...base, wo: `UPLOAD-${now}` });
    const second = await createOrder.run({ ...base, wo: `UPLOAD2-${now}` });
    ids = [first.id, second.id];
    const gps = () => ({
      latitude: 24.7,
      longitude: 46.7,
      accuracy: 5,
      timestamp: new Date().toISOString(),
    });
    for (const id of ids) await checkin.run({ id, gps: gps() });
    const image = await sharp({
      create: {
        width: 1000,
        height: 800,
        channels: 3,
        background: { r: 33, g: 120, b: 90 },
      },
    })
      .png()
      .toBuffer();
    const metadata = {
      orderId: first.id,
      groupId: "O03",
      instance: "1",
      captureId: crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      gps: gps(),
      source: "camera" as const,
    };
    const created = await storeEvidence(image, metadata);
    const retry = await storeEvidence(image, metadata);
    assert.equal(created.id, retry.id);
    const [photo] = await db
      .select()
      .from(schema.pmrEvidence)
      .where(eq(schema.pmrEvidence.id, created.id));
    assert.ok(photo);
    assert.equal(photo.analysis?.complete, false);
    assert.equal(photo.state, "Pending analysis");
    assert.equal(photo.linkedEtls.length, 0);
    const loaded = await readPrivateBlob(
      photo.handle as unknown as PrivateBlobHandle,
    );
    assert.deepEqual(Buffer.from(loaded!.data), image);
    const historical = await storeEvidence(image, {
      ...metadata,
      orderId: second.id,
      captureId: crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      gps: gps(),
    });
    const [reused] = await db
      .select()
      .from(schema.pmrEvidence)
      .where(eq(schema.pmrEvidence.id, historical.id));
    assert.ok(
      reused.findings.some(
        (f) => f.code === "historical-reuse" && f.severity === "block",
      ),
    );
    await assert.rejects(
      () =>
        storeEvidence(image, {
          ...metadata,
          source: "gallery",
          captureId: crypto.randomUUID(),
        }),
      /admin approval/,
    );
    const approval = await approveGallery.run({
      id: first.id,
      groups: ["O03"],
      reason: "Synthetic one-image test",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      maxImages: 1,
    });
    const imported = await storeEvidence(image, {
      ...metadata,
      source: "gallery",
      approvalId: approval.id,
      captureId: crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      gps: gps(),
    });
    assert.ok(imported.id);
    await assert.rejects(
      () =>
        storeEvidence(image, {
          ...metadata,
          source: "gallery",
          approvalId: approval.id,
          captureId: crypto.randomUUID(),
        }),
      /admin approval/,
    );
    console.log(
      "PASS: upload path persisted binary handle, authenticated-context byte roundtrip via synthetic provider, pending AI, retry idempotency, historical reuse gate, gallery authorization and quota exhaustion. Production provider not tested.",
    );
  });
} finally {
  for (const id of ids) {
    await db
      .delete(schema.pmrEvidence)
      .where(eq(schema.pmrEvidence.orderId, id));
    await db
      .delete(schema.pmrApprovals)
      .where(eq(schema.pmrApprovals.orderId, id));
    await db.delete(schema.pmrAudit).where(eq(schema.pmrAudit.orderId, id));
    await db.delete(schema.pmrOrders).where(eq(schema.pmrOrders.id, id));
  }
  await db
    .delete(schema.pmrMembers)
    .where(eq(schema.pmrMembers.ownerEmail, email));
  unregisterPrivateBlobProvider("pmr-fixture-only");
}
process.exit(0);
