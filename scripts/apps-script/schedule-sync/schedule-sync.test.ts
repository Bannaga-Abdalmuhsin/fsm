import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';

const SHEET_ID = '<SCHEDULE_SHEET_ID>';
const CMDB_ID = '<CMDB_SHEET_ID>';
const TOKEN = 'test-token-with-enough-entropy-0123456789abcdef';
const HEADERS = ['Site ID', 'Region', 'District', 'Date', 'TCN Number', 'TCN Time', 'Field team name', 'Supervisor name'];

function loadAppsScript(props: Record<string, string>, lockAcquired = true) {
  const context: Record<string, unknown> = {
    Date,
    console: { log: () => {} },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: (date: Date, tz: string, pattern: string) => {
        if (pattern !== 'yyyy-MM-dd') throw new Error('unexpected pattern');
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (name: string) => props[name] ?? null }),
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => lockAcquired, releaseLock: () => {} }),
    },
  };
  const ctx = createContext(context);
  runInContext(readFileSync(join(__dirname, 'Code.gs'), 'utf8'), ctx);
  return ctx as any;
}

const validProps = {
  SHEET_ID,
  CMDB_SHEET_ID: CMDB_ID,
  SUPABASE_URL: 'https://gzjikifzdmfkrvxcixlw.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'publishable',
  SYNC_TOKEN: TOKEN,
};

// 2026-11-01 00:00 in Asia/Riyadh is 2026-10-31T21:00:00Z
const riyadhMidnight = new Date('2026-10-31T21:00:00Z');
const SYNC_ID_A = '11111111-1111-4111-8111-111111111111';

describe('Apps Script schedule sync', () => {
  it('normalizes a real Riyadh date cell and keeps a missing TCN end time null', () => {
    const app = loadAppsScript(validProps);
    const headers = [...HEADERS, 'Sync ID', 'WO Number', 'Site Type', 'Latitude', 'Longitude', 'Technician Email'];
    const values = [headers, ['TEST-SITE-001', 'EAST JUBAIL', 'JUBAIL', riyadhMidnight, 'TCN-EXAMPLE-001', '16:00', 'Example Team', 'Example Supervisor', SYNC_ID_A, 'WO-1', 'odu', 27.0, 49.6, 'Tech@Example.com']];
    const display = [headers, ['TEST-SITE-001', 'EAST JUBAIL', 'JUBAIL', '1-Nov', 'TCN-EXAMPLE-001', '16:00', 'Example Team', 'Example Supervisor', SYNC_ID_A, 'WO-1', 'odu', '27', '49.6', 'Tech@Example.com']];

    const plan = app.buildSyncPlan_(values, display);
    const row = plan.rows[0];

    expect(row.pmr_date).toBe('2026-11-01');
    expect(row.tcn_start).toBe('2026-11-01T16:00:00+03:00');
    expect(row.tcn_end).toBeNull();
    expect(row.technician_email).toBe('tech@example.com');
    expect(row.site_type).toBe('ODU');
    expect(row.issues).toEqual(['TCN End Time is missing']);
    expect(row.raw.Region).toBe('EAST JUBAIL');
  });

  it('computes a TCN end time only when the source provides one', () => {
    const app = loadAppsScript(validProps);
    const headers = [...HEADERS, 'Sync ID', 'TCN End Time'];
    const values = [headers, ['TEST-SITE-001', 'EAST JUBAIL', 'JUBAIL', riyadhMidnight, 'CRQ1', '16:00', 'T', 'S', SYNC_ID_A, '18:30']];
    const display = [headers, ['TEST-SITE-001', 'EAST JUBAIL', 'JUBAIL', '1-Nov', 'CRQ1', '16:00', 'T', 'S', SYNC_ID_A, '18:30']];
    expect(app.buildSyncPlan_(values, display).rows[0].tcn_end).toBe('2026-11-01T18:30:00+03:00');
  });

  it('reports incomplete rows as issues instead of inventing values', () => {
    const app = loadAppsScript(validProps);
    const headers = [...HEADERS, 'Sync ID'];
    const values = [headers, ['TEST-SITE-001', 'EAST JUBAIL', 'JUBAIL', riyadhMidnight, 'CRQ1', '16:00', 'T', 'S', '']];
    const display = [headers, ['TEST-SITE-001', 'EAST JUBAIL', 'JUBAIL', '1-Nov', 'CRQ1', '16:00', 'T', 'S', '']];
    const plan = app.buildSyncPlan_(values, display);
    const row = plan.rows[0];
    expect(row.issues).toEqual(expect.arrayContaining(['WO Number is missing', 'Technician Email is missing', 'TCN End Time is missing']));
    expect(row.technician_email).toBeNull();
    expect(row.latitude).toBeNull();
    expect(plan.newSyncIds).toHaveLength(1);
    expect(plan.syncColumn).toBe(HEADERS.length);
  });

  it('rejects duplicate Sync IDs', () => {
    const app = loadAppsScript(validProps);
    const headers = [...HEADERS, 'Sync ID'];
    const row = ['TEST-SITE-001', 'EAST JUBAIL', 'JUBAIL', riyadhMidnight, 'CRQ1', '16:00', 'T', 'S', SYNC_ID_A];
    const display = [headers, ['TEST-SITE-001', 'EAST JUBAIL', 'JUBAIL', '1-Nov', 'CRQ1', '16:00', 'T', 'S', SYNC_ID_A], ['TEST-SITE-002', 'EAST JUBAIL', 'JUBAIL', '1-Nov', 'CRQ2', '17:00', 'T', 'S', SYNC_ID_A]];
    expect(() => app.buildSyncPlan_([headers, row, row], display)).toThrow(/Duplicate Sync ID/);
  });

  it('rejects a sheet missing required headers', () => {
    const app = loadAppsScript(validProps);
    const display = [['Site ID', 'Region'], ['TEST-SITE-001', 'EAST']];
    expect(() => app.buildSyncPlan_(display, display)).toThrow(/Missing required headers/);
  });

  it('rejects a configuration pointing at another sheet or Supabase project', () => {
    expect(() => loadAppsScript({ ...validProps, SHEET_ID: 'other' }).readConfig_()).toThrow(/SHEET_ID does not match/);
    expect(() => loadAppsScript({ ...validProps, SUPABASE_URL: 'https://other.supabase.co' }).readConfig_()).toThrow(/SUPABASE_URL does not match/);
  });

  it('skips a run when another run holds the lock', () => {
    const app = loadAppsScript(validProps, false);
    expect(() => app.syncSources()).not.toThrow();
  });

  it('rejects a CMDB_SHEET_ID that is not the CMDB sheet', () => {
    expect(() => loadAppsScript({ ...validProps, CMDB_SHEET_ID: 'other' }).readConfig_()).toThrow(/CMDB_SHEET_ID does not match/);
  });
});

function colIndex(letters: string) {
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

function cmdbGrid(rows: Array<Record<string, unknown>>) {
  const grid: unknown[][] = [];
  for (let r = 0; r < 3; r++) grid.push(new Array(34).fill(''));
  rows.forEach((cells) => {
    const line: unknown[] = new Array(34).fill('');
    Object.entries(cells).forEach(([letter, value]) => {
      line[colIndex(letter)] = value;
    });
    grid.push(line);
  });
  return grid;
}

describe('Apps Script CMDB sync', () => {
  const siteCells = (overrides: Record<string, unknown> = {}) => ({
    B: 'TEST-SITE-001',
    E: 'EAST JUBAIL',
    F: 'JUBAIL',
    I: 'Jubail industrial',
    J: 27,
    K: 49.6,
    L: 'Active',
    Q: 'Vendor A',
    AH: 'Outdoor',
    ...overrides,
  });

  it('maps CMDB columns B, E, F, I, J, K, L, Q, AH from row 4 onward', () => {
    const app = loadAppsScript(validProps);
    const values = cmdbGrid([siteCells(), siteCells({ B: 'TEST-SITE-002', AH: 'Shelter' })]);
    const rows = app.buildSiteRows_(values, values.map((r: unknown[]) => r.map(String)));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      site_id: 'TEST-SITE-001',
      source_row: 4,
      location: 'Jubail industrial',
      latitude: 27,
      longitude: 49.6,
      site_status: 'Active',
      site_type: 'ODU',
      vendor: 'Vendor A',
      region: 'EAST JUBAIL',
      district: 'JUBAIL',
    });
    expect(rows[1].site_type).toBe('SHELTER');
  });

  it('keeps invalid GPS as null and an unknown site type as null instead of guessing', () => {
    const app = loadAppsScript(validProps);
    const values = cmdbGrid([siteCells({ B: 'TEST-SITE-004', J: 'n/a', K: '', AH: 'Rooftop' })]);
    const [row] = app.buildSiteRows_(values, values.map((r: unknown[]) => r.map(String)));
    expect(row.latitude).toBeNull();
    expect(row.longitude).toBeNull();
    expect(row.site_type).toBeNull();
  });

  it('skips blank rows and rejects duplicate or unnamed site rows with their row numbers', () => {
    const app = loadAppsScript(validProps);
    const withGap = cmdbGrid([siteCells(), {}, siteCells({ B: 'TEST-SITE-003' })]);
    expect(app.buildSiteRows_(withGap, withGap.map((r: unknown[]) => r.map(String)))).toHaveLength(2);

    const duplicate = cmdbGrid([siteCells(), siteCells()]);
    expect(() => app.buildSiteRows_(duplicate, duplicate.map((r: unknown[]) => r.map(String)))).toThrow(/Duplicate CMDB Site ID TEST-SITE-001 on rows 4 and 5/);

    const unnamed = cmdbGrid([siteCells({ B: '' })]);
    expect(() => app.buildSiteRows_(unnamed, unnamed.map((r: unknown[]) => r.map(String)))).toThrow(/row 4 has data but no Site ID/);
  });
});

describe('pmr_sync_schedule SQL', () => {
  let db: PGlite;

  const row = (overrides: Record<string, unknown> = {}) => ({
    sync_id: SYNC_ID_A,
    sheet_row: 2,
    raw: { 'Site ID': 'TEST-SITE-001', Region: 'EAST JUBAIL', 'TCN Time': '16:00' },
    site_id: 'TEST-SITE-001',
    region: 'EAST JUBAIL',
    district: 'JUBAIL',
    pmr_date: '2026-11-01',
    tcn_number: 'TCN-EXAMPLE-001',
    tcn_start: '2026-11-01T16:00:00+03:00',
    tcn_end: '2026-11-01T18:00:00+03:00',
    team_name: 'Example Team',
    supervisor_name: 'Example Supervisor',
    wo_number: 'WO-1',
    site_type: 'ODU',
    latitude: 27,
    longitude: 49.6,
    technician_email: 'tech@example.com',
    issues: [],
    ...overrides,
  });

  const payload = (rows: unknown[]) => ({ tab: 'Sheet1', ran_at: '2026-11-01T00:00:00Z', rows });

  async function call(sheetId: string, body: unknown, token: string | null = TOKEN) {
    await db.query("select set_config('request.headers', $1, false)", [JSON.stringify(token === null ? {} : { 'x-pmr-sync-token': token })]);
    const res = await db.query<{ result: any }>('select public.pmr_sync_schedule($1, $2::jsonb) as result', [sheetId, JSON.stringify(body)]);
    return res.rows[0].result;
  }

  async function stagedRows() {
    const res = await db.query<any>('select sync_id, state, region, validation_errors, order_id from public.pmr_schedule_rows order by sync_id');
    return res.rows;
  }

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      create table public.pmr_orders (order_id text primary key);
      create table public.pmr_members (owner_email text primary key, org_id text, regions text[]);
      create table public.pmr_sites (
        site_id text primary key,
        location text,
        latitude double precision,
        longitude double precision,
        site_status text,
        site_type text,
        vendor text,
        region text,
        district text,
        source_id text,
        source_row integer,
        refreshed_at timestamptz,
        validation_errors jsonb
      );
      create table public.pmr_schedule_rows (
        source_id text not null,
        sync_id uuid not null,
        source_tab text,
        source_row int,
        site_id text,
        region text,
        district text,
        scheduled_date date,
        tcn_number text,
        tcn_time text,
        team_name text,
        supervisor_name text,
        raw jsonb,
        state text not null default 'draft' check (state in ('draft', 'ready', 'conflict', 'linked')),
        validation_errors jsonb,
        order_id text references public.pmr_orders(order_id),
        synced_at timestamptz,
        primary key (source_id, sync_id)
      );
      insert into public.pmr_members (owner_email, org_id, regions) values ('tech@example.com', 'org', '{EAST}');
    `);
    await db.exec(`
      do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    `);
    await db.exec(readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'schedule-sync.sql'), 'utf8'));
    await db.exec("insert into public.pmr_sites(site_id,latitude,longitude,site_type,region) values ('TEST-SITE-001',27,49.6,'ODU','EAST JUBAIL')");
    await db.query(
      "insert into pmr_private.schedule_sync_tokens (name, token_sha256) values ('apps-script-sync', encode(sha256(convert_to($1, 'UTF8')), 'hex'))",
      [TOKEN],
    );
  });

  it('rejects a wrong sheet and missing or wrong tokens without writing', async () => {
    await expect(call('other-sheet', payload([row()]))).rejects.toThrow(/sheet not allowed/);
    await expect(call(SHEET_ID, payload([row()]), null)).rejects.toThrow(/unauthorized/);
    await expect(call(SHEET_ID, payload([row()]), 'wrong')).rejects.toThrow(/unauthorized/);
    expect(await stagedRows()).toEqual([]);
  });

  it('stages a complete row as ready only when the technician email is provisioned', async () => {
    const result = await call(SHEET_ID, payload([row()]));
    expect(result.ok).toBe(true);
    expect(result.counts).toMatchObject({ received: 1, ready: 1, draft: 0, conflict: 0 });
    const [staged] = await stagedRows();
    expect(staged.state).toBe('ready');
    expect(staged.validation_errors).toEqual([]);
  });

  it('keeps incomplete or unprovisioned rows as draft with explicit reasons', async () => {
    const result = await call(SHEET_ID, payload([
      row({ wo_number: null, technician_email: 'nobody@example.com' }),
    ]));
    expect(result.counts).toMatchObject({ ready: 0, draft: 1 });
    const [staged] = await stagedRows();
    expect(staged.state).toBe('draft');
    expect(staged.validation_errors).toEqual(expect.arrayContaining(['WO Number is missing', 'Technician email is not provisioned']));
  });

  it('quarantines every row of a site whose regions conflict within the sheet', async () => {
    const second = '22222222-2222-4222-8222-222222222222';
    const result = await call(SHEET_ID, payload([
      row({ site_id: 'TEST-SITE-005', region: 'WEST' }),
      row({ sync_id: second, site_id: 'TEST-SITE-005', region: 'EAST', sheet_row: 3 }),
    ]));
    expect(result.counts).toMatchObject({ conflict: 2, ready: 0 });
    const staged = await stagedRows();
    expect(staged.map((r) => r.state)).toEqual(['conflict', 'conflict']);
  });

  it('is idempotent on repeated identical syncs', async () => {
    await call(SHEET_ID, payload([row()]));
    const second = await call(SHEET_ID, payload([row()]));
    expect(second.counts).toMatchObject({ received: 1, ready: 1 });
    expect(await stagedRows()).toHaveLength(1);
  });

  it('never deletes rows missing from the sheet and reports them as absent', async () => {
    await call(SHEET_ID, payload([row()]));
    const result = await call(SHEET_ID, payload([row({ sync_id: '33333333-3333-4333-8333-333333333333', sheet_row: 3 })]));
    expect(result.counts.absent_from_sheet).toBe(1);
    expect(await stagedRows()).toHaveLength(2);
  });

  it('freezes linked rows so source edits cannot change workflow state or order link', async () => {
    await db.exec(`
      insert into public.pmr_orders (order_id) values ('ORD-1');
      insert into public.pmr_schedule_rows (source_id, sync_id, site_id, region, state, order_id)
      values ('${SHEET_ID}', '${SYNC_ID_A}', 'TEST-SITE-001', 'EAST JUBAIL', 'linked', 'ORD-1');
    `);
    const result = await call(SHEET_ID, payload([row({ region: 'WEST' })]));
    expect(result.counts.linked_frozen).toBe(1);
    const [staged] = await stagedRows();
    expect(staged).toMatchObject({ state: 'linked', region: 'EAST JUBAIL', order_id: 'ORD-1' });
  });

  it('rejects duplicate sync IDs and records the rejected run without staging rows', async () => {
    const result = await call(SHEET_ID, payload([row(), row({ site_id: 'TEST-SITE-002' })]));
    expect(result).toMatchObject({ ok: false, error: 'duplicate sync_id' });
    expect(await stagedRows()).toEqual([]);
    const runs = await db.query<{ status: string }>('select status from pmr_private.schedule_sync_runs');
    expect(runs.rows).toEqual([{ status: 'rejected' }]);
  });

  it('is callable by the anon role but cannot read staged rows directly', async () => {
    await db.exec('grant usage on schema public to anon');
    await db.exec('set role anon');
    await db.query("select set_config('request.headers', $1, false)", [JSON.stringify({ 'x-pmr-sync-token': TOKEN })]);
    const res = await db.query<{ result: any }>('select public.pmr_sync_schedule($1, $2::jsonb) as result', [SHEET_ID, JSON.stringify(payload([row()]))]);
    expect(res.rows[0].result.ok).toBe(true);
    await expect(db.query('select * from public.pmr_schedule_rows')).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
  });

  it('rejects an empty schedule payload instead of treating it as absence of every row', async () => {
    const result = await call(SHEET_ID, payload([]));
    expect(result).toMatchObject({ ok: false, error: 'no rows received' });
  });
});

describe('pmr_sync_sites SQL', () => {
  let db: PGlite;

  const site = (overrides: Record<string, unknown> = {}) => ({
    site_id: 'TEST-SITE-001',
    source_row: 4,
    location: 'Jubail industrial',
    latitude: 27,
    longitude: 49.6,
    site_status: 'Active',
    site_type: 'ODU',
    vendor: 'Vendor A',
    region: 'EAST JUBAIL',
    district: 'JUBAIL',
    raw: {},
    ...overrides,
  });

  async function callSites(sheetId: string, body: unknown, token: string | null = TOKEN) {
    await db.query("select set_config('request.headers', $1, false)", [JSON.stringify(token === null ? {} : { 'x-pmr-sync-token': token })]);
    const res = await db.query<{ result: any }>('select public.pmr_sync_sites($1, $2::jsonb) as result', [sheetId, JSON.stringify(body)]);
    return res.rows[0].result;
  }

  const payload = (rows: unknown[]) => ({ tab: 'Mastersheet Data Base', ran_at: '2026-11-01T00:00:00Z', rows });

  async function sites() {
    const res = await db.query<any>('select site_id, latitude, longitude, site_type, region, validation_errors from public.pmr_sites order by site_id');
    return res.rows;
  }

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      create table public.pmr_orders (order_id text primary key);
      create table public.pmr_members (owner_email text primary key, org_id text, regions text[]);
      create table public.pmr_sites (
        site_id text primary key,
        location text,
        latitude double precision,
        longitude double precision,
        site_status text,
        site_type text,
        vendor text,
        region text,
        district text,
        source_id text,
        source_row integer,
        refreshed_at timestamptz,
        validation_errors jsonb
      );
      create table public.pmr_schedule_rows (
        source_id text not null,
        sync_id uuid not null,
        source_tab text,
        source_row int,
        site_id text,
        region text,
        district text,
        scheduled_date date,
        tcn_number text,
        tcn_time text,
        team_name text,
        supervisor_name text,
        raw jsonb,
        state text not null default 'draft',
        validation_errors jsonb,
        order_id text,
        synced_at timestamptz,
        primary key (source_id, sync_id)
      );
    `);
    await db.exec(`
      do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    `);
    await db.exec(readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'schedule-sync.sql'), 'utf8'));
    await db.query(
      "insert into pmr_private.schedule_sync_tokens (name, token_sha256) values ('apps-script-sync', encode(sha256(convert_to($1, 'UTF8')), 'hex'))",
      [TOKEN],
    );
  });

  it('rejects a wrong sheet, a missing or wrong token, and an empty payload without writing', async () => {
    await expect(callSites(SHEET_ID, payload([site()]))).rejects.toThrow(/sheet not allowed/);
    await expect(callSites(CMDB_ID, payload([site()]), null)).rejects.toThrow(/unauthorized/);
    expect(await callSites(CMDB_ID, payload([]))).toMatchObject({ ok: false, error: 'no rows received' });
    expect(await sites()).toEqual([]);
  });

  it('stages a complete site with no validation errors', async () => {
    const result = await callSites(CMDB_ID, payload([site()]));
    expect(result.counts).toMatchObject({ received: 1, upserted: 1, missing_gps: 0 });
    expect(await sites()).toEqual([
      expect.objectContaining({ site_id: 'TEST-SITE-001', latitude: 27, longitude: 49.6, site_type: 'ODU', validation_errors: [] }),
    ]);
  });

  it('keeps a site with invalid GPS and no site type with explicit reasons instead of blocking the sync', async () => {
    const result = await callSites(CMDB_ID, payload([site({ site_id: 'TEST-SITE-004', latitude: null, longitude: null, site_type: null })]));
    expect(result.counts).toMatchObject({ upserted: 1, missing_gps: 1 });
    const [staged] = await sites();
    expect(staged).toMatchObject({ site_id: 'TEST-SITE-004', latitude: null, longitude: null, site_type: null });
    expect(staged.validation_errors).toEqual(expect.arrayContaining(['Latitude is missing or invalid', 'Longitude is missing or invalid', 'Site type is missing or invalid']));
  });

  it('rejects a payload with a duplicate site_id without staging any site', async () => {
    const result = await callSites(CMDB_ID, payload([site(), site({ source_row: 5 })]));
    expect(result).toMatchObject({ ok: false, error: 'duplicate site_id' });
    expect(await sites()).toEqual([]);
  });

  it('upserts idempotently and never deletes a site that disappears from the CMDB', async () => {
    await callSites(CMDB_ID, payload([site(), site({ site_id: 'TEST-SITE-002', source_row: 5 })]));
    const again = await callSites(CMDB_ID, payload([site()]));
    expect(again.counts).toMatchObject({ upserted: 1, absent_from_sheet: 1 });
    expect((await sites()).map((s) => s.site_id)).toEqual(['TEST-SITE-001', 'TEST-SITE-002']);
  });

  it('is callable by anon while direct reads of site rows stay denied', async () => {
    await db.exec('grant usage on schema public to anon');
    await db.exec('set role anon');
    await db.query("select set_config('request.headers', $1, false)", [JSON.stringify({ 'x-pmr-sync-token': TOKEN })]);
    const res = await db.query<{ result: any }>('select public.pmr_sync_sites($1, $2::jsonb) as result', [CMDB_ID, JSON.stringify(payload([site()]))]);
    expect(res.rows[0].result.ok).toBe(true);
    await expect(db.query('select * from public.pmr_sites')).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
  });
});
