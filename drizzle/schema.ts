import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

export const staffMembers = pgTable("staff_members", {
  email: text("email").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const workOrders = pgTable("work_orders", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  siteName: text("site_name").notNull(),
  siteLatitude: doublePrecision("site_latitude").notNull(),
  siteLongitude: doublePrecision("site_longitude").notNull(),
  tcnStart: text("tcn_start").notNull(),
  tcnEnd: text("tcn_end").notNull(),
  siteId: text("site_id"),
  siteType: text("site_type").notNull().default("SHELTER"),
  woNumber: text("wo_number"),
  tcnNumber: text("tcn_number"),
  pmrMonth: text("pmr_month"),
  region: text("region"),
  team: text("team"),
  scheduledStart: text("scheduled_start"),
  scheduledEnd: text("scheduled_end"),
  technicianEmail: text("technician_email"),
  status: text("status").notNull().default("assigned"),
  checkedInAt: text("checked_in_at"),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const captureTasks = pgTable("capture_tasks", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id").notNull(),
  etlCode: text("etl_code").notNull(),
  title: text("title").notNull(),
  evidenceGroup: text("evidence_group").notNull(),
  expectedEquipment: text("expected_equipment").notNull(),
  requiredDetails: text("required_details").notNull(),
  isHousekeeping: boolean("is_housekeeping").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const checklistItems = pgTable("checklist_items", {
  id: text("id").primaryKey(),
  siteType: text("site_type").notNull(),
  templateVersion: text("template_version").notNull(),
  suffix: integer("suffix").notNull(),
  originalId: text("original_id"),
  groupCode: text("group_code").notNull(),
  groupLabel: text("group_label").notNull(),
  originalWording: text("original_wording"),
  wordingStatus: text("wording_status").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const evidenceLinks = pgTable("evidence_links", {
  id: text("id").primaryKey(),
  evidenceId: text("evidence_id").notNull(),
  checklistItemId: text("checklist_item_id").notNull(),
  workOrderId: text("work_order_id").notNull(),
  linkedByEmail: text("linked_by_email").notNull(),
  linkedAt: text("linked_at").notNull(),
});

export const galleryApprovals = pgTable("gallery_approvals", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id").notNull(),
  technicianEmail: text("technician_email").notNull(),
  evidenceGroups: text("evidence_groups").notNull(),
  reason: text("reason").notNull(),
  maxImages: integer("max_images").notNull(),
  imagesUsed: integer("images_used").notNull().default(0),
  expiresAt: text("expires_at").notNull(),
  approvedByEmail: text("approved_by_email").notNull(),
  createdAt: text("created_at").notNull(),
});

export const evidence = pgTable("evidence", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id").notNull(),
  taskId: text("task_id").notNull(),
  technicianEmail: text("technician_email").notNull(),
  source: text("source").notNull(),
  galleryApprovalId: text("gallery_approval_id"),
  imageSha256: text("image_sha256").notNull(),
  averageHash: text("average_hash").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  sharpness: doublePrecision("sharpness").notNull(),
  skyFraction: doublePrecision("sky_fraction").notNull(),
  meanLuma: doublePrecision("mean_luma").notNull(),
  daylightSignal: text("daylight_signal").notNull(),
  deviceCapturedAt: text("device_captured_at").notNull(),
  deviceTimezone: text("device_timezone").notNull(),
  gpsTime: text("gps_time"),
  clientSentAt: text("client_sent_at").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  serverOffsetMs: integer("server_offset_ms").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  accuracyMeters: doublePrecision("accuracy_meters").notNull(),
  distanceMeters: doublePrecision("distance_meters").notNull(),
  locationTimestamp: text("location_timestamp").notNull(),
  sunAltitudeDegrees: doublePrecision("sun_altitude_degrees").notNull(),
  visionStatus: text("vision_status").notNull(),
  decision: text("decision").notNull(),
  decisionBasis: text("decision_basis").notNull(),
  decisionNote: text("decision_note"),
  decidedBy: text("decided_by"),
  decidedAt: text("decided_at"),
});

export const evidenceFindings = pgTable("evidence_findings", {
  id: text("id").primaryKey(),
  evidenceId: text("evidence_id").notNull(),
  kind: text("kind").notNull(),
  code: text("code").notNull(),
  severity: text("severity").notNull(),
  resolvable: boolean("resolvable").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull(),
  resolutionNote: text("resolution_note"),
  resolvedBy: text("resolved_by"),
  resolvedAt: text("resolved_at"),
  createdAt: text("created_at").notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id"),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  eventType: text("event_type").notNull(),
  actorEmail: text("actor_email").notNull(),
  message: text("message").notNull(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  accuracyMeters: doublePrecision("accuracy_meters"),
  distanceMeters: doublePrecision("distance_meters"),
  createdAt: text("created_at").notNull(),
});
