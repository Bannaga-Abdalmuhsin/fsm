import { z } from "zod";

import { roles, type Member } from "./access";
import type { EvidenceGroup } from "./checklists";
import { geoSchema, siteTypeSchema, type Geo, type Policy } from "./pmr";

const etlSchema = z.object({
  number: z.number(),
  code: z.string(),
  description: z.string(),
  source: z.string(),
  requiresClarification: z.boolean(),
});

const groupSchema = z.object({
  id: z.string(),
  title: z.string(),
  etls: z.array(etlSchema),
});

export const memberRowSchema = z.object({
  owner_email: z.string().min(1),
  org_id: z.string().nullable(),
  role: z.enum(roles),
  regions: z.array(z.string()),
});

export const orderRowSchema = z.object({
  id: z.string(),
  owner_email: z.string(),
  org_id: z.string().nullable(),
  site_id: z.string(),
  site_type: siteTypeSchema,
  region: z.string(),
  team: z.string(),
  assignee: z.string(),
  wo: z.string(),
  tcn: z.string(),
  month: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  scheduled_start: z.string(),
  scheduled_end: z.string(),
  tcn_start: z.string(),
  tcn_end: z.string(),
  status: z.string(),
  checked_in_at: z.string().nullable(),
  check_in: geoSchema.nullable(),
  inventory: z.record(z.string(), z.number()),
  checklist: z.array(groupSchema),
  policy: z.custom<Policy>(
    (value) => typeof value === "object" && value !== null,
  ),
  version: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  review_note: z.string(),
});

export const evidenceRowSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  group_id: z.string(),
  instance: z.string(),
  captured_at: z.string(),
  uploaded_at: z.string(),
  gps: geoSchema,
  sha: z.string(),
  handle: z.object({ bucket: z.string(), path: z.string() }).passthrough(),
  state: z.string(),
  linked_etls: z.array(z.number()),
  review_note: z.string(),
  revision: z.number(),
});

export type MemberRow = z.infer<typeof memberRowSchema>;
export type OrderRow = z.infer<typeof orderRowSchema>;
export type EvidenceRow = z.infer<typeof evidenceRowSchema>;

export function toMember(row: unknown): Member {
  const parsed = memberRowSchema.parse(row);
  return {
    ownerEmail: parsed.owner_email,
    orgId: parsed.org_id,
    role: parsed.role,
    regions: parsed.regions,
  };
}

export type Order = {
  id: string;
  ownerEmail: string;
  orgId: string | null;
  siteId: string;
  siteType: "ODU" | "SHELTER";
  region: string;
  team: string;
  assignee: string;
  wo: string;
  tcn: string;
  month: string;
  latitude: number;
  longitude: number;
  scheduledStart: string;
  scheduledEnd: string;
  tcnStart: string;
  tcnEnd: string;
  status: string;
  checkedInAt: string | null;
  checkIn: Geo | null;
  inventory: Record<string, number>;
  checklist: EvidenceGroup[];
  policy: Policy;
  version: number;
  reviewNote: string;
  updatedAt: string;
};

export function toOrder(row: unknown): Order {
  const r = orderRowSchema.parse(row);
  return {
    id: r.id,
    ownerEmail: r.owner_email,
    orgId: r.org_id,
    siteId: r.site_id,
    siteType: r.site_type,
    region: r.region,
    team: r.team,
    assignee: r.assignee,
    wo: r.wo,
    tcn: r.tcn,
    month: r.month,
    latitude: r.latitude,
    longitude: r.longitude,
    scheduledStart: r.scheduled_start,
    scheduledEnd: r.scheduled_end,
    tcnStart: r.tcn_start,
    tcnEnd: r.tcn_end,
    status: r.status,
    checkedInAt: r.checked_in_at,
    checkIn: r.check_in,
    inventory: r.inventory,
    checklist: r.checklist,
    policy: r.policy,
    version: r.version,
    reviewNote: r.review_note,
    updatedAt: r.updated_at,
  };
}

export type Evidence = {
  id: string;
  orderId: string;
  groupId: string;
  instance: string;
  capturedAt: string;
  uploadedAt: string;
  gps: Geo;
  sha: string;
  bucket: string;
  path: string;
  state: string;
  linkedEtls: number[];
  reviewNote: string;
  revision: number;
};

export function toEvidence(row: unknown): Evidence {
  const r = evidenceRowSchema.parse(row);
  return {
    id: r.id,
    orderId: r.order_id,
    groupId: r.group_id,
    instance: r.instance,
    capturedAt: r.captured_at,
    uploadedAt: r.uploaded_at,
    gps: r.gps,
    sha: r.sha,
    bucket: r.handle.bucket,
    path: r.handle.path,
    state: r.state,
    linkedEtls: r.linked_etls,
    reviewNote: r.review_note,
    revision: r.revision,
  };
}

export const newOrderSchema = z
  .object({
    siteId: z.string().trim().min(1),
    siteType: siteTypeSchema,
    region: z.string().min(1),
    team: z.string().trim().min(1),
    wo: z.string().trim().min(1),
    tcn: z.string().trim().min(1),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    scheduledStart: z.string().datetime({ offset: true }),
    scheduledEnd: z.string().datetime({ offset: true }),
    tcnStart: z.string().datetime({ offset: true }),
    tcnEnd: z.string().datetime({ offset: true }),
    assignee: z.string().trim().email(),
  })
  .refine((v) => Date.parse(v.scheduledEnd) > Date.parse(v.scheduledStart), {
    message: "Scheduled end must be after scheduled start.",
    path: ["scheduledEnd"],
  })
  .refine((v) => Date.parse(v.tcnEnd) > Date.parse(v.tcnStart), {
    message: "TCN end must be after TCN start.",
    path: ["tcnEnd"],
  });

export type NewOrderInput = z.infer<typeof newOrderSchema>;
