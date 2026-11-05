import { readFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, describe, expect, it } from "vitest";

import { defaultPolicy } from "../shared/pmr";

const here = path.dirname(fileURLToPath(import.meta.url));
const rlsSql = readFileSync(path.join(here, "rls.sql"), "utf8");
const migrationSql = readFileSync(
  path.join(here, "migrations", "0002_pmr_roles_scopes_ingest.sql"),
  "utf8",
);
const nativeSql = readFileSync(path.join(here,"migrations","0003_native_operations.sql"),"utf8");
const SECRET = "test-ingest-secret";

const supabaseStubs = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create schema storage;
  create schema extensions;
  grant usage on schema auth to anon, authenticated;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;
  create table auth.users(id text primary key,email text,email_confirmed_at timestamptz);
  create function auth.uid() returns text language sql stable as $$ select auth.jwt()->>'sub' $$;
  create table storage.buckets (id text primary key, name text, public boolean default false);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name text,
    owner uuid
  );
  alter table storage.objects enable row level security;
  grant usage on schema public, storage to anon, authenticated;
  grant select, insert, delete on storage.objects to authenticated;
  grant select on storage.buckets to authenticated;
`;

const referenceTables = `
  create table public.pmr_members (
    id text primary key, owner_email text not null, org_id text,
    role text not null, regions jsonb not null
  );
  create unique index pmr_members_scope_member on public.pmr_members (coalesce(org_id, ''), owner_email);
  create table public.pmr_orders (
    id text primary key, owner_email text not null, org_id text, site_id text not null,
    site_type text not null, region text not null, team text not null, assignee text not null,
    wo text not null, tcn text not null, month text not null, latitude double precision not null,
    longitude double precision not null, scheduled_start text not null, scheduled_end text not null,
    tcn_start text not null, tcn_end text not null, status text not null default 'Assigned',
    checked_in_at text, check_in jsonb, inventory jsonb not null, checklist jsonb not null,
    policy jsonb not null, version int not null default 1, created_at text not null,
    updated_at text not null, review_note text not null default ''
  );
  create table public.pmr_results (
    id text primary key, owner_email text not null, org_id text,
    order_id text not null references public.pmr_orders(id), etl_code text not null,
    instance text not null, status text not null, remarks text not null, readings text not null,
    tt text not null, noc text not null, updated_at text not null
  );
  create unique index pmr_result_etl on public.pmr_results (order_id, etl_code, instance);
  create table public.pmr_evidence (
    id text primary key, owner_email text not null, org_id text,
    order_id text not null references public.pmr_orders(id), group_id text not null,
    instance text not null, source text not null, approval_id text, capture_id text not null,
    captured_at text not null, uploaded_at text not null, gps jsonb not null, sha text not null,
    perceptual_hash text not null, handle jsonb not null, mime text not null, width int not null,
    height int not null, findings jsonb not null, quality jsonb not null, analysis jsonb,
    state text not null, linked_etls jsonb not null, review_note text not null default '',
    revision int not null default 1
  );
  create unique index pmr_capture_id on public.pmr_evidence (owner_email, capture_id);
  create table public.pmr_approvals (
    id text primary key, owner_email text not null, org_id text,
    order_id text not null references public.pmr_orders(id), technician text not null,
    groups jsonb not null, reason text not null, expires_at text not null,
    max_images int not null, used int not null default 0, revoked_at text
  );
  create table public.pmr_audit (
    id text primary key, owner_email text not null, org_id text, order_id text not null,
    event text not null, detail text not null, created_at text not null
  );
  create table public.pmr_policies (
    id text primary key, owner_email text not null, org_id text,
    policy jsonb not null, created_at text not null
  );
  -- Supabase default privileges: the API roles start with full table access.
  grant all on all tables in schema public to anon, authenticated;
  grant execute on all functions in schema public to anon, authenticated;
`;

const ORDER = "order-1";
const ORDER_B = "order-2";
const ORG_B_ORDER = "order-b";
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const TCN_START = iso(now - 60 * 60_000);
const TCN_END = iso(now + 3 * 60 * 60_000);

const checklist = [
  {
    id: "g1",
    title: "Group 1",
    etls: [
      {
        number: 1,
        code: "ETL-1",
        description: "First",
        source: "",
        requiresClarification: false,
      },
      {
        number: 2,
        code: "ETL-2",
        description: "Second",
        source: "",
        requiresClarification: true,
      },
    ],
  },
];

function fix(overrides: Record<string, unknown> = {}) {
  return {
    latitude: 24.7,
    longitude: 46.7,
    accuracy: 5,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function order(id: string, orgId: string | null, assignee: string, region = "CR") {
  return {
    id,
    owner_email: "sup@a.test",
    org_id: orgId,
    site_id: `SITE-${id}`,
    site_type: "ODU",
    region,
    team: "Team",
    assignee,
    wo: `WO-${id}`,
    tcn: `TCN-${id}`,
    month: "2026-10",
    latitude: 24.7,
    longitude: 46.7,
    scheduled_start: TCN_START,
    scheduled_end: TCN_END,
    tcn_start: TCN_START,
    tcn_end: TCN_END,
    status: "Assigned",
    inventory: {},
    checklist,
    policy: defaultPolicy,
    created_at: TCN_START,
    updated_at: TCN_START,
  };
}

describe("supabase/rls.sql", () => {
  let db: PGlite;
  let acceptedId: string;

  async function as(
    email: string,
    appMetadata: Record<string, unknown> = {},
  ) {
    const claims = JSON.stringify({
      email,
      sub: email,
      role: "authenticated",
      app_metadata: appMetadata,
    });
    await db.exec("reset role");
    await db.query("insert into auth.users values($1,$1,now()) on conflict(id) do nothing",[email]);
    await db.query("select set_config('request.jwt.claims', $1, false)", [
      claims,
    ]);
    await db.exec("set role authenticated");
  }

  async function asAdmin() {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }

  async function insertOrder(row: Record<string, unknown>) {
    await asAdmin();
    const keys = Object.keys(row);
    const values = keys.map((key) =>
      typeof row[key] === "object" && row[key] !== null
        ? JSON.stringify(row[key])
        : row[key],
    );
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    await db.query(
      `insert into public.pmr_orders (${keys.join(", ")}) values (${placeholders})`,
      values,
    );
  }

  function signPayload(payload: string) {
    return createHmac("sha256", SECRET).update(payload).digest("hex");
  }

  function evidencePayload(overrides: Record<string, unknown> = {}) {
    const captureId = randomUUID();
    const sha = randomUUID().replace(/-/g, "");
    const payload = JSON.stringify({
      order_id: ORDER,
      group_id: "g1",
      instance: "g1",
      source: "capture",
      approval_id: null,
      capture_id: captureId,
      captured_at: new Date().toISOString(),
      captured_at_source: overrides.source === "gallery" ? "exif" : "device-camera",
      gps: fix(),
      sha,
      perceptual_hash: "",
      handle: { bucket: "pmr-evidence", path: `${ORDER}/${captureId}.jpg` },
      mime: "image/jpeg",
      width: 1200,
      height: 900,
      findings: [],
      quality: { score: overrides.state === "Supervisor review" ? 92 : null, provisional: overrides.state !== "Supervisor review", dimensions: {} },
      analysis: { status: "complete" },
      state: "Pending analysis",
      linked_etls: [1],
      ...overrides,
    });
    return { payload, captureId };
  }

  async function uploadObject(
    email: string,
    captureId: string,
    orderId = ORDER,
    source = "capture", approval: unknown = null,
  ) {
    await asAdmin();
    await db.query("insert into public.pmr_capture_sessions(id,order_id,technician,group_id,source,approval_id,issued_at,expires_at,gps) values($1,$2,$3,'g1',$4,$5,now()-interval '1 minute',now()+interval '2 minutes',$6) on conflict(id) do nothing",[captureId,orderId,email,source,approval,JSON.stringify(fix())]);
    await as(email);
    await db.query(
      "insert into storage.objects (bucket_id, name) values ('pmr-evidence', $1)",
      [`${orderId}/${captureId}.jpg`],
    );
  }

  async function registerAs(
    email: string,
    payload: string,
    signature = signPayload(payload),
  ) {
    const parsed = JSON.parse(payload) as { capture_id: string };
    await uploadObject(email, parsed.capture_id, JSON.parse(payload).order_id,JSON.parse(payload).source,JSON.parse(payload).approval_id);
    return db.query<{ id: string }>(
      "select public.pmr_register_evidence($1, $2) as id",
      [payload, signature],
    );
  }

  beforeAll(async () => {
    db = await PGlite.create({ extensions: { pgcrypto } });
    await db.exec(supabaseStubs);
    await db.exec(referenceTables);
    await db.exec(rlsSql);
    await db.exec(migrationSql);
    await db.exec(nativeSql);
    await db.exec(
      `insert into public.pmr_ingest_keys (id, secret) values (1, '${SECRET}') on conflict(id) do update set secret=excluded.secret`,
    );
    await db.exec(`
      insert into public.pmr_members (id, owner_email, org_id, role, regions) values
        ('m1', 'sup@a.test', 'org-a', 'supervisor', '["CR"]'),
        ('m2', 'admin@a.test', 'org-a', 'admin', '["CR","ER"]'),
        ('m3', 'tech@a.test', 'org-a', 'technician', '["CR"]'),
        ('m4', 'tech-b@a.test', 'org-a', 'technician', '["CR"]'),
        ('m5', 'admin@b.test', 'org-b', 'admin', '["CR"]'),
        ('m6', 'multi@x.test', 'org-a', 'technician', '["CR"]'),
        ('m7', 'multi@x.test', 'org-b', 'technician', '["CR"]');
    `);
    await insertOrder(order(ORDER, "org-a", "tech@a.test"));
    await insertOrder(order(ORDER_B, "org-a", "tech-b@a.test"));
    await insertOrder(order(ORG_B_ORDER, "org-b", "tech@b.test"));
  }, 60_000);

  describe("identity and membership", () => {
    it("resolves a single membership", async () => {
      await as("tech@a.test");
      const res = await db.query<{ m: { state: string; member: { org_id: string } } }>(
        "select public.pmr_membership() as m",
      );
      expect(res.rows[0].m.state).toBe("ready");
      expect(res.rows[0].m.member.org_id).toBe("org-a");
    });

    it("reports an ambiguous multi-org user without a claim and returns no membership row", async () => {
      await as("multi@x.test");
      const state = await db.query<{ m: { state: string } }>(
        "select public.pmr_membership() as m",
      );
      expect(state.rows[0].m.state).toBe("ambiguous");
      const me = await db.query("select * from public.pmr_me()");
      expect(me.rows).toHaveLength(0);
    });

    it("resolves a multi-org user through the app_metadata org claim", async () => {
      await as("multi@x.test", { pmr_org_id: "org-b" });
      const res = await db.query<{ m: { state: string; member: { org_id: string } } }>(
        "select public.pmr_membership() as m",
      );
      expect(res.rows[0].m.state).toBe("ready");
      expect(res.rows[0].m.member.org_id).toBe("org-b");
    });

    it("reports unprovisioned users and fails closed on a claim with no membership", async () => {
      await as("stranger@x.test");
      const res = await db.query<{ m: { state: string } }>(
        "select public.pmr_membership() as m",
      );
      expect(res.rows[0].m.state).toBe("unprovisioned");
      await as("tech@a.test", { pmr_org_id: "org-z" });
      const claimed = await db.query("select * from public.pmr_me()");
      expect(claimed.rows).toHaveLength(0);
    });
  });

  describe("read scope", () => {
    it("lets a technician read only their own assigned orders", async () => {
      await as("tech@a.test");
      const res = await db.query<{ id: string }>("select id from public.pmr_orders order by id");
      expect(res.rows.map((r) => r.id)).toEqual([ORDER]);
    });

    it("keeps admins inside their own organization", async () => {
      await as("admin@b.test");
      const res = await db.query<{ id: string }>("select id from public.pmr_orders order by id");
      expect(res.rows.map((r) => r.id)).toEqual([ORG_B_ORDER]);
    });

    it("lets an org admin see only their organization's members", async () => {
      await as("admin@a.test");
      const res = await db.query<{ owner_email: string }>(
        "select owner_email from public.pmr_members order by owner_email",
      );
      expect(res.rows.every((r) => r.owner_email.endsWith("@a.test") || r.owner_email === "multi@x.test")).toBe(true);
      expect(res.rows.some((r) => r.owner_email === "admin@b.test")).toBe(false);
    });
  });

  describe("direct REST writes are refused", () => {
    it("blocks a technician from submitting their own work order by update", async () => {
      await as("tech@a.test");
      const res = await db.query(
        "update public.pmr_orders set status = 'Submitted' where id = $1",
        [ORDER],
      );
      expect(res.affectedRows).toBe(0);
    });

    it("blocks a supervisor from writing workflow status directly", async () => {
      await as("sup@a.test");
      await expect(
        db.query("update public.pmr_orders set status = 'Submitted' where id = $1", [ORDER]),
      ).rejects.toThrow(/PMR workflow/);
    });

    it("blocks direct ETL PASS inserts", async () => {
      await as("tech@a.test");
      await expect(
        db.query(
          `insert into public.pmr_results (id, owner_email, org_id, order_id, etl_code, instance, status, remarks, readings, tt, noc, updated_at)
           values ('r-x', 'tech@a.test', 'org-a', $1, 'ETL-1', 'g1', 'Pass', '', '', '', '', now()::text)`,
          [ORDER],
        ),
      ).rejects.toThrow(/permission denied/);
    });

    it("blocks direct evidence insert and review updates", async () => {
      await as("tech@a.test");
      await expect(
        db.query("insert into public.pmr_evidence select * from public.pmr_evidence limit 0"),
      ).rejects.toThrow(/permission denied/);
      await as("sup@a.test");
      await expect(
        db.query("update public.pmr_evidence set state = 'Accepted'"),
      ).rejects.toThrow(/permission denied/);
    });

    it("blocks direct audit and approval writes", async () => {
      await as("tech@a.test");
      await expect(
        db.query(
          "insert into public.pmr_audit (id, owner_email, org_id, order_id, event, detail, created_at) values ('a', 'x', 'org-a', $1, 'e', 'd', 'now')",
          [ORDER],
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query(
          "insert into public.pmr_approvals (id, owner_email, org_id, order_id, technician, groups, reason, expires_at, max_images) values ('a', 'x', 'org-a', $1, 'tech@a.test', '[]', 'r', 'now', 1)",
          [ORDER],
        ),
      ).rejects.toThrow(/permission denied/);
    });

    it("hides the ingest key from signed-in users", async () => {
      await as("admin@a.test");
      await expect(db.query("select secret from public.pmr_ingest_keys")).rejects.toThrow(
        /permission denied/,
      );
    });

    it("blocks technicians from managing members", async () => {
      await as("tech@a.test");
      await expect(
        db.query("select public.pmr_upsert_member('x@a.test', 'org-a', 'technician', '[\"CR\"]', '[]')"),
      ).rejects.toThrow(/Only admins/);
    });
  });

  describe("check-in, start, ETL PASS, submit", () => {
    it("rejects a fix outside the boundary, a stale fix, and a low-accuracy fix", async () => {
      await as("tech@a.test");
      await expect(
        db.query("select public.pmr_check_in($1, 1, $2::jsonb)", [
          ORDER,
          JSON.stringify(fix({ latitude: 24.71 })),
        ]),
      ).rejects.toThrow(/site boundary/);
      await expect(
        db.query("select public.pmr_check_in($1, 1, $2::jsonb)", [
          ORDER,
          JSON.stringify(fix({ timestamp: iso(Date.now() - 600_000) })),
        ]),
      ).rejects.toThrow(/stale/);
      await expect(
        db.query("select public.pmr_check_in($1, 1, $2::jsonb)", [
          ORDER,
          JSON.stringify(fix({ accuracy: 80 })),
        ]),
      ).rejects.toThrow(/accuracy/);
    });

    it("checks in on a valid fix and enforces the version guard", async () => {
      await as("tech@a.test");
      await expect(
        db.query("select public.pmr_check_in($1, 99, $2::jsonb)", [ORDER, JSON.stringify(fix())]),
      ).rejects.toThrow(/changed/);
      await db.query("select public.pmr_check_in($1, 1, $2::jsonb)", [ORDER, JSON.stringify(fix())]);
      const row = await db.query<{ status: string; version: number }>(
        "select status, version from public.pmr_orders where id = $1",
        [ORDER],
      );
      expect(row.rows[0]).toEqual({ status: "Checked in", version: 2 });
    });

    it("starts work and refuses to start twice", async () => {
      await as("tech@a.test");
      await db.query("select public.pmr_start_work($1, 2)", [ORDER]);
      await expect(db.query("select public.pmr_start_work($1, 3)", [ORDER])).rejects.toThrow(
        /Check in before starting|changed/,
      );
    });

    it("refuses ETL PASS before evidence is accepted", async () => {
      await as("tech@a.test");
      await expect(
        db.query("select public.pmr_record_etl_result($1, 1, 'ETL-1', 'g1', 'Pass', '', '', '', '')", [ORDER]),
      ).rejects.toThrow(/accepted evidence/);
    });

    it("refuses submission while required ETLs lack PASS", async () => {
      await as("tech@a.test");
      await expect(db.query("select public.pmr_submit_order($1, 3)", [ORDER])).rejects.toThrow(
        /Complete every ETL/,
      );
    });

    it("refuses an unknown ETL code", async () => {
      await as("tech@a.test");
      await expect(
        db.query("select public.pmr_record_etl_result($1, 1, 'ETL-99', '1', 'Fail', '', '', '', '')", [ORDER]),
      ).rejects.toThrow(/Unknown ETL/);
    });
  });

  describe("server-signed evidence registration", () => {
    let pendingId: string;

    it("refuses a payload with a forged signature", async () => {
      const { payload } = evidencePayload();
      await expect(registerAs("tech@a.test", payload, "00".repeat(32))).rejects.toThrow(
        /signature is invalid/,
      );
    });

    it("registers a signed payload from the assigned technician", async () => {
      const { payload } = evidencePayload();
      const res = await registerAs("tech@a.test", payload);
      pendingId = res.rows[0].id;
      expect(pendingId).toBeTruthy();
    });

    it("refuses a second upload of the same photo bytes", async () => {
      const first = evidencePayload({ sha: "a".repeat(64) });
      await registerAs("tech@a.test", first.payload);
      const second = evidencePayload({ sha: "a".repeat(64) });
      await expect(registerAs("tech@a.test", second.payload)).rejects.toThrow(
        /already submitted/,
      );
    });

    it("refuses an object path that belongs to another order", async () => {
      const { payload } = evidencePayload({
        handle: { bucket: "pmr-evidence", path: `${ORDER_B}/${randomUUID()}.jpg` },
      });
      await as("tech@a.test");
      await expect(
        db.query("select public.pmr_register_evidence($1, $2)", [payload, signPayload(payload)]),
      ).rejects.toThrow(/does not match/);
    });

    it("returns the same capture id when a signed registration is replayed", async () => {
      const { payload, captureId } = evidencePayload();
      const first = await registerAs("tech@a.test", payload);
      expect(first.rows[0].id).toBe(captureId);
      await as("tech@a.test");
      const replay = await db.query<{ id: string }>(
        "select public.pmr_register_evidence($1, $2) as id",
        [payload, signPayload(payload)],
      );
      expect(replay.rows[0].id).toBe(captureId);
      const count = await db.query<{ n: number }>(
        "select count(*)::int as n from public.pmr_evidence where id = $1",
        [captureId],
      );
      expect(count.rows[0].n).toBe(1);
    });

    it("refuses a replay that reuses a capture id for different bytes", async () => {
      const { payload, captureId } = evidencePayload();
      await registerAs("tech@a.test", payload);
      const conflicting = JSON.stringify({
        ...JSON.parse(payload),
        sha: "c".repeat(64),
      });
      await as("tech@a.test");
      await expect(
        db.query("select public.pmr_register_evidence($1, $2)", [
          conflicting,
          signPayload(conflicting),
        ]),
      ).rejects.toThrow(/already registered with different content/);
      expect(captureId).toBeTruthy();
    });

    it("accepts a stamped derivative stored beside the original", async () => {
      const { payload: base, captureId } = evidencePayload();
      const payload = JSON.stringify({
        ...JSON.parse(base),
        handle: {
          bucket: "pmr-evidence",
          path: `${ORDER}/${captureId}.jpg`,
          derivative: { bucket: "pmr-evidence", path: `${ORDER}/${captureId}.stamped.jpg` },
        },
      });
      await uploadObject("tech@a.test", captureId);
      await as("tech@a.test");
      await expect(
        db.query("select public.pmr_register_evidence($1, $2)", [payload, signPayload(payload)]),
      ).rejects.toThrow(/derivative does not match/);
      await db.query(
        "insert into storage.objects (bucket_id, name) values ('pmr-evidence', $1)",
        [`${ORDER}/${captureId}.stamped.jpg`],
      );
      const res = await db.query<{ id: string }>(
        "select public.pmr_register_evidence($1, $2) as id",
        [payload, signPayload(payload)],
      );
      expect(res.rows[0].id).toBe(captureId);
    });

    it("refuses a capture time outside the TCN window", async () => {
      const { payload } = evidencePayload({
        captured_at: iso(now - 2 * 60 * 60_000 - 1),
      });
      await expect(registerAs("tech@a.test", payload)).rejects.toThrow(/TCN window/);
    });

    it("refuses near-duplicate perceptual hashes on the same order", async () => {
      await as("tech@a.test");
      const a = evidencePayload({ perceptual_hash: "0000000000000000", sha: "b".repeat(64) });
      await registerAs("tech@a.test", a.payload);
      const b = evidencePayload({ perceptual_hash: "0000000000000001", sha: "c".repeat(64) });
      await expect(registerAs("tech@a.test", b.payload)).rejects.toThrow(/near-duplicate/);
    });

    it("refuses review by a technician", async () => {
      await as("tech@a.test");
      await expect(
        db.query("select public.pmr_review_evidence($1, 1, 'Accepted', '')", [pendingId]),
      ).rejects.toThrow(/Only managers/);
    });

    it("refuses to accept evidence that has not passed automated analysis", async () => {
      await as("sup@a.test");
      await expect(
        db.query("select public.pmr_review_evidence($1, 1, 'Accepted', '')", [pendingId]),
      ).rejects.toThrow(/automated analysis/);
    });

    it("lets a supervisor accept analysed evidence and rejects a stale revision", async () => {
      const { payload } = evidencePayload({ state: "Supervisor review", sha: "d".repeat(64) });
      const reg = await registerAs("tech@a.test", payload);
      const id = reg.rows[0].id;
      await as("sup@a.test");
      await expect(
        db.query("select public.pmr_review_evidence($1, 9, 'Accepted', '')", [id]),
      ).rejects.toThrow(/changed/);
      await db.query("select public.pmr_review_evidence($1, 1, 'Accepted', '')", [id]);
      const state = await db.query<{ state: string }>(
        "select state from public.pmr_evidence where id = $1",
        [id],
      );
      expect(state.rows[0].state).toBe("Accepted");
      acceptedId = id;
    });

    it("refuses a retake without a reason", async () => {
      const { payload } = evidencePayload({ state: "Supervisor review", sha: "e".repeat(64) });
      const reg = await registerAs("tech@a.test", payload);
      await as("sup@a.test");
      await expect(
        db.query("select public.pmr_review_evidence($1, 1, 'Retake required', '  ')", [reg.rows[0].id]),
      ).rejects.toThrow(/reason is required/);
    });

    it("refuses to revise accepted evidence", async () => {
      await as("sup@a.test");
      await expect(
        db.query("select public.pmr_review_evidence($1, 2, 'Retake required', 'too late')", [acceptedId]),
      ).rejects.toThrow(/cannot be sent back/);
    });
  });

  describe("gallery approvals", () => {
    let approvalId: string;

    it("refuses a grant for another technician or with an out-of-range quota", async () => {
      await as("admin@a.test");
      await expect(
        db.query(
          "select public.pmr_grant_gallery_approval($1, 'tech-b@a.test', '[\"g1\"]', 'camera failed', 1, 3)",
          [ORDER],
        ),
      ).rejects.toThrow(/assigned technician/);
      await expect(
        db.query(
          "select public.pmr_grant_gallery_approval($1, 'tech@a.test', '[\"g1\"]', 'camera failed', 1, 50)",
          [ORDER],
        ),
      ).rejects.toThrow(/1 to 20/);
    });

    it("grants a one-image approval that is consumed on use", async () => {
      await as("admin@a.test");
      const res = await db.query<{ id: string }>(
        "select public.pmr_grant_gallery_approval($1, 'tech@a.test', '[\"g1\"]', 'camera failed', 1, 1) as id",
        [ORDER],
      );
      approvalId = res.rows[0].id;
      const { payload } = evidencePayload({
        source: "gallery", captured_at_source: "exif",
        approval_id: approvalId,
      });
      await registerAs("tech@a.test", payload);
    });

    it("refuses a second gallery upload once the quota is spent", async () => {
      const { payload } = evidencePayload({
        source: "gallery", captured_at_source: "exif",
        approval_id: approvalId,
      });
      await expect(registerAs("tech@a.test", payload)).rejects.toThrow(/No valid gallery approval/);
    });

    it("refuses an expired approval", async () => {
      await as("admin@a.test");
      const res = await db.query<{ id: string }>(
        "select public.pmr_grant_gallery_approval($1, 'tech@a.test', '[\"g1\"]', 'late', 1, 2) as id",
        [ORDER],
      );
      await asAdmin();
      await db.query("update public.pmr_approvals set expires_at = '2000-01-01T00:00:00.000Z' where id = $1", [
        res.rows[0].id,
      ]);
      const { payload } = evidencePayload({ source: "gallery", captured_at_source: "exif", approval_id: res.rows[0].id });
      await expect(registerAs("tech@a.test", payload)).rejects.toThrow(/No valid gallery approval/);
    });

    it("refuses a revoked approval and gallery uploads without an embedded capture time", async () => {
      await as("admin@a.test");
      const res = await db.query<{ id: string }>(
        "select public.pmr_grant_gallery_approval($1, 'tech@a.test', '[\"g1\"]', 'revoke me', 1, 2) as id",
        [ORDER],
      );
      await db.query("select public.pmr_revoke_gallery_approval($1)", [res.rows[0].id]);
      const revoked = evidencePayload({ source: "gallery", captured_at_source: "exif", approval_id: res.rows[0].id });
      await expect(registerAs("tech@a.test", revoked.payload)).rejects.toThrow(/No valid gallery approval/);

      await as("admin@a.test");
      const live = await db.query<{ id: string }>(
        "select public.pmr_grant_gallery_approval($1, 'tech@a.test', '[\"g1\"]', 'no exif', 1, 2) as id",
        [ORDER],
      );
      const noExif = evidencePayload({
        source: "gallery", captured_at_source: "exif",
        approval_id: live.rows[0].id,
        captured_at_source: "device-camera",
      });
      await expect(registerAs("tech@a.test", noExif.payload)).rejects.toThrow(/embedded capture time/);
    });

    it("refuses a camera capture that tries to borrow an approval", async () => {
      await as("admin@a.test");
      const res = await db.query<{ id: string }>(
        "select public.pmr_grant_gallery_approval($1, 'tech@a.test', '[\"g1\"]', 'x', 1, 2) as id",
        [ORDER],
      );
      const camera = evidencePayload({ approval_id: res.rows[0].id });
      await expect(registerAs("tech@a.test", camera.payload)).rejects.toThrow(/cannot use an approval/);
    });
  });

  describe("ETL PASS and submission", () => {
    it("records PASS only after the evidence is accepted", async () => {
      await as("tech@a.test");
      await db.query(
        "select public.pmr_record_etl_result($1, 1, 'ETL-1', 'g1', 'Pass', 'ok', '', '', '')",
        [ORDER],
      );
      const row = await db.query<{ status: string }>(
        "select status from public.pmr_results where order_id = $1 and etl_code = 'ETL-1'",
        [ORDER],
      );
      expect(row.rows[0].status).toBe("Pass");
    });

    it("submits after every ETL is explicitly completed and outstanding retakes are resolved", async () => {
      await asAdmin();
      await db.query("update public.pmr_evidence set state='Superseded' where order_id=$1 and state in ('Pending analysis','Retake required')",[ORDER]);
      await as("tech@a.test");
      await db.query("select public.pmr_record_etl_result($1,2,'ETL-2','g1','Not tested','Source clarification needed','','','')",[ORDER]);
      await db.query("select public.pmr_submit_order($1, 3)", [ORDER]);
      const row = await db.query<{ status: string }>(
        "select status from public.pmr_orders where id = $1",
        [ORDER],
      );
      expect(row.rows[0].status).toBe("Submitted");
    });

    it("refuses further evidence on a submitted order", async () => {
      const { payload } = evidencePayload();
      await expect(registerAs("tech@a.test", payload)).rejects.toThrow(/Check in and start work/);
    });
  });

  describe("member administration", () => {
    it("lets an org admin add a member in their own organization", async () => {
      await as("admin@a.test");
      await db.query("select public.pmr_upsert_member('new@a.test', 'org-a', 'technician', '[\"CR\"]', '[]')");
      const row = await db.query<{ role: string }>(
        "select role from public.pmr_members where owner_email = 'new@a.test'",
      );
      expect(row.rows[0].role).toBe("technician");
    });

    it("refuses members in another organization, invalid regions, and self-removal", async () => {
      await as("admin@a.test");
      await expect(
        db.query("select public.pmr_upsert_member('x@b.test', 'org-b', 'technician', '[\"CR\"]', '[]')"),
      ).rejects.toThrow(/your organization/);
      await expect(
        db.query("select public.pmr_upsert_member('x@a.test', 'org-a', 'technician', '[\"XX\"]', '[]')"),
      ).rejects.toThrow(/Invalid region/);
      await expect(
        db.query("select public.pmr_remove_member('admin@a.test', 'org-a')"),
      ).rejects.toThrow(/own membership/);
    });

    it("lets an admin remove a member in their own organization", async () => {
      await as("admin@a.test");
      await db.query("select public.pmr_remove_member('new@a.test', 'org-a')");
      await asAdmin();
      const row = await db.query(
        "select 1 from public.pmr_members where owner_email = 'new@a.test'",
      );
      expect(row.rows).toHaveLength(0);
    });
  });

  describe("cross-organization isolation", () => {
    it("keeps another organization's evidence and reviews out of reach", async () => {
      await as("admin@b.test");
      const evidence = await db.query("select id from public.pmr_evidence");
      expect(evidence.rows).toHaveLength(0);
      await expect(
        db.query("select public.pmr_review_evidence($1, 1, 'Accepted', '')", [acceptedId]),
      ).rejects.toThrow(/not found/);
    });

    it("refuses an approval grant for an order outside the admin's scope", async () => {
      await as("admin@a.test");
      await expect(
        db.query(
          "select public.pmr_grant_gallery_approval($1, 'tech@b.test', '[\"g1\"]', 'x', 1, 1)",
          [ORG_B_ORDER],
        ),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("team leader and regional manager scopes", () => {
    const BRAVO = "ord-bravo";

    beforeAll(async () => {
      await asAdmin();
      await db.exec(`
        insert into public.pmr_members (id, owner_email, org_id, role, regions, teams) values
          ('tl1', 'tl@a.test', 'org-a', 'team_leader', '["CR"]', '["Team"]'),
          ('rm1', 'rm@a.test', 'org-a', 'regional_manager', '["CR"]', '[]');
      `);
      await insertOrder({ ...order(BRAVO, "org-a", "tech-c@a.test"), team: "Bravo" });
    });

    it("shows a team leader only orders from their teams", async () => {
      await as("tl@a.test");
      const rows = await db.query<{ id: string }>("select id from public.pmr_orders");
      const ids = rows.rows.map((r) => r.id);
      expect(ids).toContain(ORDER);
      expect(ids).not.toContain(BRAVO);
    });

    it("lets a regional manager see every order in their region", async () => {
      await as("rm@a.test");
      const rows = await db.query<{ id: string }>("select id from public.pmr_orders");
      const ids = rows.rows.map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining([ORDER, BRAVO]));
      expect(ids).not.toContain(ORG_B_ORDER);
    });

    it("keeps team leaders and regional managers out of member provisioning", async () => {
      for (const email of ["rm@a.test", "tl@a.test"]) {
        await as(email);
        await expect(
          db.query("select public.pmr_upsert_member('x@a.test', 'org-a', 'technician', '[\"CR\"]', '[]')"),
        ).rejects.toThrow(/Only admins/);
      }
    });

    it("keeps regional managers from scheduling orders", async () => {
      await as("rm@a.test");
      await expect(
        db.query(
          `insert into public.pmr_orders (id, owner_email, org_id, site_id, site_type, region, team, assignee, wo, tcn, month, latitude, longitude, scheduled_start, scheduled_end, tcn_start, tcn_end, status, inventory, checklist, policy, created_at, updated_at)
           select 'ord-x', owner_email, org_id, site_id, site_type, region, team, assignee, wo, tcn, month, latitude, longitude, scheduled_start, scheduled_end, tcn_start, tcn_end, 'Assigned', inventory, checklist, policy, created_at, updated_at
           from public.pmr_orders where id = $1`,
          [BRAVO],
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("keeps gallery approval strictly admin-only even for scoped reviewers", async () => {
      for (const email of ["tl@a.test","rm@a.test"]) {
        await as(email);
        await expect(db.query("select public.pmr_grant_gallery_approval($1,'tech@a.test','[\"g1\"]','x',1,1)",[ORDER])).rejects.toThrow(/Only admins/);
      }
    });

    it("validates team assignments when provisioning roles", async () => {
      await as("admin@a.test");
      await expect(
        db.query("select public.pmr_upsert_member('tl2@a.test', 'org-a', 'team_leader', '[\"CR\"]', '[]')"),
      ).rejects.toThrow(/at least one team/);
      await expect(
        db.query("select public.pmr_upsert_member('t9@a.test', 'org-a', 'technician', '[\"CR\"]', '[\"Team\"]')"),
      ).rejects.toThrow(/Only team leaders/);
      await expect(
        db.query("select public.pmr_upsert_member('rm2@a.test', 'org-a', 'regional_manager', '[\"CR\"]', '[]')"),
      ).resolves.toBeDefined();
    });

    it("keeps the pmr_membership shape for team leaders", async () => {
      await as("tl@a.test");
      const res = await db.query<{ m: { state: string; member: Record<string, unknown> } }>(
        "select public.pmr_membership() as m",
      );
      expect(res.rows[0].m.state).toBe("ready");
      expect(Object.keys(res.rows[0].m.member).sort()).toEqual(["org_id", "owner_email", "regions", "role"]);
      expect(res.rows[0].m.member.role).toBe("team_leader");
    });
  });

  it("writes an audit trail for workflow actions", async () => {
    await as("sup@a.test");
    const rows = await db.query<{ event: string }>(
      "select event from public.pmr_audit where order_id = $1 order by created_at",
      [ORDER],
    );
    const events = rows.rows.map((r) => r.event);
    expect(events).toEqual(expect.arrayContaining(["check-in", "start", "evidence-captured", "evidence-review", "submit"]));
  });
});
