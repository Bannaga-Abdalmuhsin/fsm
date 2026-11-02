import {
  canAssignOrder,
  canOperateOrder,
  canReviewEvidence,
  scopeOrders,
  type Member,
} from "@shared/access";
import { checklists } from "@shared/checklists";
import {
  captureTimeGate,
  defaultPolicy,
  evidenceDecision,
  locationGate,
  quality,
  type Geo,
} from "@shared/pmr";
import {
  toEvidence,
  toOrder,
  type Evidence,
  type NewOrderInput,
  type Order,
} from "@shared/records";

import { EVIDENCE_BUCKET, getSupabase } from "@/lib/supabase";

export async function fetchOrders(member: Member): Promise<Order[]> {
  const { data, error } = await getSupabase()
    .from("pmr_orders")
    .select("*")
    .order("scheduled_start", { ascending: true });
  if (error) throw error;
  return scopeOrders(member, data.map(toOrder));
}

export async function fetchOrder(id: string, member: Member): Promise<Order> {
  const { data, error } = await getSupabase()
    .from("pmr_orders")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  const order = toOrder(data);
  if (scopeOrders(member, [order]).length === 0)
    throw new Error("Work order not found.");
  return order;
}

export async function fetchEvidence(orderIds: string[]): Promise<Evidence[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("pmr_evidence")
    .select("*")
    .in("order_id", orderIds)
    .order("captured_at", { ascending: false });
  if (error) throw error;
  return data.map(toEvidence);
}

export async function signedEvidenceUrl(evidence: Evidence) {
  const { data, error } = await getSupabase()
    .storage.from(evidence.bucket)
    .createSignedUrl(evidence.path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function createOrder(input: NewOrderInput, member: Member) {
  if (member.role === "technician")
    throw new Error("Only supervisors and admins can create work orders.");
  if (!member.regions.includes(input.region))
    throw new Error("Work order region is outside your scope.");
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const { error } = await getSupabase().from("pmr_orders").insert({
    id,
    owner_email: member.ownerEmail,
    org_id: member.orgId,
    site_id: input.siteId,
    site_type: input.siteType,
    region: input.region,
    team: input.team,
    assignee: input.assignee,
    wo: input.wo,
    tcn: input.tcn,
    month: input.month,
    latitude: input.latitude,
    longitude: input.longitude,
    scheduled_start: input.scheduledStart,
    scheduled_end: input.scheduledEnd,
    tcn_start: input.tcnStart,
    tcn_end: input.tcnEnd,
    status: "Assigned",
    checked_in_at: null,
    check_in: null,
    inventory: {},
    checklist: checklists[input.siteType],
    policy: defaultPolicy,
    version: 1,
    created_at: now,
    updated_at: now,
    review_note: "",
  });
  if (error) throw error;
  return id;
}

export async function assignOrder(
  order: Order,
  assignee: string,
  member: Member,
) {
  if (!canAssignOrder(member, order))
    throw new Error("You cannot assign this work order.");
  const { error } = await getSupabase()
    .from("pmr_orders")
    .update({
      assignee,
      version: order.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("version", order.version);
  if (error) throw error;
}

async function updateOrder(
  order: Order,
  member: Member,
  patch: Record<string, unknown>,
) {
  if (!canOperateOrder(member, order))
    throw new Error("This work order is not assigned to you.");
  const { error } = await getSupabase()
    .from("pmr_orders")
    .update({
      ...patch,
      version: order.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("version", order.version);
  if (error) throw error;
}

export async function checkInOrder(order: Order, fix: Geo, member: Member) {
  const gate = locationGate(fix, order, Date.now(), order.policy);
  if (!gate.allowed) throw new Error(gate.reason ?? "Location check failed.");
  await updateOrder(order, member, {
    check_in: fix,
    checked_in_at: fix.timestamp,
    status: "Checked in",
  });
}

export async function setOrderStatus(
  order: Order,
  status: "In progress" | "Submitted",
  member: Member,
) {
  await updateOrder(order, member, { status });
}

export async function captureEvidence(args: {
  order: Order;
  member: Member;
  groupId: string;
  etlNumber: number;
  file: File;
  fix: Geo;
  instance: string;
}) {
  const { order, member, file, fix } = args;
  if (!canOperateOrder(member, order))
    throw new Error("This work order is not assigned to you.");
  if (!order.checkIn)
    throw new Error("Check in at the site before capturing evidence.");
  const location = locationGate(fix, order, Date.now(), order.policy);
  if (!location.allowed)
    throw new Error(location.reason ?? "Location check failed.");
  const capturedAt = new Date(file.lastModified).toISOString();
  const uploadedAt = new Date().toISOString();
  const timeReason = captureTimeGate(
    capturedAt,
    order.tcnStart,
    order.tcnEnd,
    uploadedAt,
  );
  if (timeReason) throw new Error(timeReason);

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  bitmap.close();
  const sha = await sha256Hex(await file.arrayBuffer());
  const captureId = crypto.randomUUID();
  const ownerKey = member.orgId ?? member.ownerEmail;
  const path = `${ownerKey}/${order.id}/${captureId}.jpg`;
  const supabase = getSupabase();

  const upload = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
  if (upload.error) throw upload.error;

  const { error } = await supabase.from("pmr_evidence").insert({
    id: captureId,
    owner_email: member.ownerEmail,
    org_id: member.orgId,
    order_id: order.id,
    group_id: args.groupId,
    instance: args.instance,
    source: "capture",
    approval_id: null,
    capture_id: captureId,
    captured_at: capturedAt,
    uploaded_at: uploadedAt,
    gps: fix,
    sha,
    perceptual_hash: "",
    handle: { bucket: EVIDENCE_BUCKET, path },
    mime: file.type || "image/jpeg",
    width,
    height,
    findings: [],
    quality: quality(
      {
        clarity: null,
        coverage: null,
        integrity: null,
        location: 100,
        time: 100,
      },
      order.policy,
    ),
    analysis: null,
    state: evidenceDecision([], false),
    linked_etls: [args.etlNumber],
    review_note: "",
    revision: 1,
  });
  if (error) {
    await supabase.storage.from(EVIDENCE_BUCKET).remove([path]);
    throw error;
  }
}

export async function reviewEvidence(args: {
  order: Order;
  member: Member;
  evidence: Evidence;
  state: "Accepted" | "Retake required";
  note: string;
}) {
  const { order, member, evidence, state, note } = args;
  if (!canReviewEvidence(member, order))
    throw new Error("You cannot review this evidence.");
  const { error } = await getSupabase()
    .from("pmr_evidence")
    .update({ state, review_note: note, revision: evidence.revision + 1 })
    .eq("id", evidence.id)
    .eq("revision", evidence.revision);
  if (error) throw error;
}

async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
