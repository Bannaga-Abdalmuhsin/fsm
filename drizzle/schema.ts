import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  doublePrecision,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { EvidenceGroup } from "../shared/checklists";
import type { Finding, Geo, Policy, Quality } from "../shared/pmr";
const scope = () => ({
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
});
export const pmrMembers = pgTable(
  "pmr_members",
  {
    id: text("id").primaryKey(),
    ...scope(),
    role: text("role").notNull(),
    regions: jsonb("regions").$type<string[]>().notNull(),
  },
  (t) => [
    uniqueIndex("pmr_members_scope_member").on(
      sql`coalesce(${t.orgId}, '')`,
      t.ownerEmail,
    ),
  ],
);
export const pmrOrders = pgTable(
  "pmr_orders",
  {
    id: text("id").primaryKey(),
    ...scope(),
    siteId: text("site_id").notNull(),
    siteType: text("site_type").notNull(),
    region: text("region").notNull(),
    team: text("team").notNull(),
    assignee: text("assignee").notNull(),
    wo: text("wo").notNull(),
    tcn: text("tcn").notNull(),
    month: text("month").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    scheduledStart: text("scheduled_start").notNull(),
    scheduledEnd: text("scheduled_end").notNull(),
    tcnStart: text("tcn_start").notNull(),
    tcnEnd: text("tcn_end").notNull(),
    status: text("status").notNull().default("Assigned"),
    checkedInAt: text("checked_in_at"),
    checkIn: jsonb("check_in").$type<Geo>(),
    inventory: jsonb("inventory").$type<Record<string, number>>().notNull(),
    checklist: jsonb("checklist").$type<EvidenceGroup[]>().notNull(),
    policy: jsonb("policy").$type<Policy>().notNull(),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    reviewNote: text("review_note").notNull().default(""),
  },
  (t) => [
    index("pmr_orders_assignee").on(t.assignee, t.orgId),
    index("pmr_orders_region").on(t.orgId, t.region),
    uniqueIndex("pmr_orders_wo_unique").on(t.ownerEmail, t.wo),
    uniqueIndex("pmr_orders_scope_wo_unique").on(
      sql`coalesce(${t.orgId}, ${t.ownerEmail})`,
      t.wo,
    ),
  ],
);
export const pmrResults = pgTable(
  "pmr_results",
  {
    id: text("id").primaryKey(),
    ...scope(),
    orderId: text("order_id")
      .notNull()
      .references(() => pmrOrders.id),
    etlCode: text("etl_code").notNull(),
    instance: text("instance").notNull(),
    status: text("status").notNull(),
    remarks: text("remarks").notNull(),
    readings: text("readings").notNull(),
    tt: text("tt").notNull(),
    noc: text("noc").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("pmr_result_etl").on(t.orderId, t.etlCode, t.instance)],
);
export const pmrEvidence = pgTable(
  "pmr_evidence",
  {
    id: text("id").primaryKey(),
    ...scope(),
    orderId: text("order_id")
      .notNull()
      .references(() => pmrOrders.id),
    groupId: text("group_id").notNull(),
    instance: text("instance").notNull(),
    source: text("source").notNull(),
    approvalId: text("approval_id"),
    captureId: text("capture_id").notNull(),
    capturedAt: text("captured_at").notNull(),
    uploadedAt: text("uploaded_at").notNull(),
    gps: jsonb("gps").$type<Geo>().notNull(),
    sha: text("sha").notNull(),
    perceptualHash: text("perceptual_hash").notNull(),
    handle: jsonb("handle").$type<Record<string, unknown>>().notNull(),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    findings: jsonb("findings").$type<Finding[]>().notNull(),
    quality: jsonb("quality").$type<Quality>().notNull(),
    analysis: jsonb("analysis").$type<Record<string, unknown>>(),
    state: text("state").notNull(),
    linkedEtls: jsonb("linked_etls").$type<string[]>().notNull(),
    reviewNote: text("review_note").notNull().default(""),
    revision: integer("revision").notNull().default(1),
  },
  (t) => [
    index("pmr_evidence_order").on(t.orderId),
    index("pmr_evidence_hash").on(t.orgId, t.sha),
    uniqueIndex("pmr_capture_id").on(t.ownerEmail, t.captureId),
  ],
);
export const pmrApprovals = pgTable("pmr_approvals", {
  id: text("id").primaryKey(),
  ...scope(),
  orderId: text("order_id")
    .notNull()
    .references(() => pmrOrders.id),
  technician: text("technician").notNull(),
  groups: jsonb("groups").$type<string[]>().notNull(),
  reason: text("reason").notNull(),
  expiresAt: text("expires_at").notNull(),
  maxImages: integer("max_images").notNull(),
  used: integer("used").notNull().default(0),
  revokedAt: text("revoked_at"),
});
export const pmrAudit = pgTable(
  "pmr_audit",
  {
    id: text("id").primaryKey(),
    ...scope(),
    orderId: text("order_id").notNull(),
    event: text("event").notNull(),
    detail: text("detail").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("pmr_audit_order").on(t.orderId, t.createdAt)],
);
export const pmrPolicies = pgTable("pmr_policies", {
  id: text("id").primaryKey(),
  ...scope(),
  policy: jsonb("policy").$type<Policy>().notNull(),
  createdAt: text("created_at").notNull(),
});
