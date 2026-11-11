import { supabase } from "./supabase";

export type Membership =
  | { state: "ready"; member: { owner_email: string; org_id: string; role: string; regions: string[]; teams?: string[] } }
  | { state: "unprovisioned" }
  | { state: "ambiguous" };

export type Order = {
  id: string;
  version: number;
  site_id: string;
  site_type: string;
  region: string;
  team: string;
  assignee: string;
  wo: string | null;
  tcn: string | null;
  tcn_start: string | null;
  tcn_end: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  inventory?: { generators?: number; admin_test?: boolean; source_order_id?: string };
  site_reference?: { location?: string; site_status?: string; vendor?: string; district?: string };
  checklist?: import("../../shared/checklists").EvidenceGroup[];
  policy?: Record<string, unknown>;
};

export type Fix = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
};

export type EtlStatus = "Pass" | "Fail" | "Not applicable" | "Not tested";

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

export async function loadMembership(): Promise<Membership> {
  const { data, error } = await client().rpc("pmr_membership");
  if (error) throw new Error(error.message);
  return data as Membership;
}

export async function listAssignedOrders(email: string, role = "technician"): Promise<Order[]> {
  let query = client()
    .from("pmr_orders")
    .select(
      "id,version,site_id,site_type,region,team,assignee,wo,tcn,tcn_start,tcn_end,latitude,longitude,status,scheduled_start,scheduled_end",
    )
    .order("scheduled_start", { ascending: true });
  if (role === "technician") query = query.eq("assignee", email);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

export async function checkIn(order: Order, fix: Fix) {
  const { error } = await client().rpc("pmr_check_in", {
    p_order: order.id,
    p_expected_version: order.version,
    p_fix: fix,
  });
  if (error) throw new Error(error.message);
}

export async function startWork(order: Order) {
  const { error } = await client().rpc("pmr_start_work", {
    p_order: order.id,
    p_expected_version: order.version,
  });
  if (error) throw new Error(error.message);
}

export async function recordEtlResult(input: {
  orderId: string;
  groupId: string;
  etlNumber: number;
  etlCode: string;
  status: EtlStatus;
  remarks: string;
  readings: string;
  tt: string;
  noc: string;
}) {
  const { error } = await client().rpc("pmr_record_etl_result", {
    p_order: input.orderId,
    p_etl_number: input.etlNumber,
    p_etl_code: input.etlCode,
    p_instance: input.groupId,
    p_status: input.status,
    p_remarks: input.remarks,
    p_readings: input.readings,
    p_tt: input.tt,
    p_noc: input.noc,
  });
  if (error) throw new Error(error.message);
}

export async function signIn(email: string, password: string) {
  const { error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw new Error("Sign-in failed. Check your email and password.");
}

export async function signOut() {
  await client().auth.signOut();
}

export async function requestPasswordReset(email: string) {
  const { error } = await client().auth.resetPasswordForEmail(email);
  if (error) throw new Error(error.message);
}

export async function openOrder(orderId: string, fix: Fix): Promise<Order> {
  const { data, error } = await client().rpc("pmr_open_order", { p_order: orderId, p_fix: fix });
  if (error) throw new Error(error.message);
  return data as Order;
}
export async function getOrder(orderId: string): Promise<Order> {
  const { data, error } = await client().from("pmr_orders").select("*").eq("id", orderId).single();
  if (error) throw new Error(error.message);
  return data;
}
export type Evidence = { id: string; group_id: string; instance: string; state: string; revision: number; quality: { score: number | null }; findings: { message: string; code: string; severity: string }[]; handle: { bucket: string; path: string; derivative?: { path: string } }; linked_etls: number[] };
export type Result = { id: string; etl_code: string; instance: string; status: string; remarks: string; readings: string; tt: string; noc: string; updated_at: string };
export type ReviewEvent = { target_id: string; stage: string; decision: string; fingerprint: string; note: string };
export type GalleryApproval = { id: string; groups: string[]; expires_at: string; max_images: number; used: number; revoked_at: string | null };
export async function orderRecords(orderId: string) {
  const [e, r, v, a, g] = await Promise.all([
    client().from("pmr_evidence").select("*").eq("order_id", orderId),
    client().from("pmr_results").select("*").eq("order_id", orderId),
    client().from("pmr_review_events").select("*").eq("order_id", orderId),
    client().from("pmr_approvals").select("*").eq("order_id", orderId),
    client().from("pmr_group_submissions").select("*").eq("order_id", orderId),
  ]);
  for (const q of [e, r, v, a, g]) if (q.error) throw new Error(q.error.message);
  return { groups: g.data as GroupSubmission[], evidence: e.data as Evidence[], results: r.data as Result[], reviews: v.data as ReviewEvent[], approvals: a.data as GalleryApproval[] };
}
export async function evidenceUrl(e: Evidence) {
  const { data, error } = await client().storage.from(e.handle.bucket).createSignedUrl(e.handle.derivative?.path ?? e.handle.path, 120);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
export async function reviewPhoto(e: Evidence, decision: string, note: string) {
  const { error } = await client().rpc("pmr_review_photo", { p_evidence: e.id, p_revision: e.revision, p_decision: decision, p_note: note });
  if (error) throw new Error(error.message);
}
export async function reviewResult(r: Result, decision: string, note: string) {
  const { error } = await client().rpc("pmr_review_result", { p_result: r.id, p_expected_updated_at: r.updated_at, p_decision: decision, p_note: note });
  if (error) throw new Error(error.message);
}
export async function grantGallery(order: Order, group: string, reason: string) {
  const { error } = await client().rpc("pmr_grant_gallery_approval", { p_order: order.id, p_technician: order.assignee, p_groups: [group], p_reason: reason, p_hours: 4, p_max_images: 3 });
  if (error) throw new Error(error.message);
}
export async function revokeGallery(id: string) {
  const { error } = await client().rpc("pmr_revoke_gallery_approval", { p_approval: id });
  if (error) throw new Error(error.message);
}
export async function submitOrder(order: Order) {
  const { error } = await client().rpc("pmr_submit_order", { p_order: order.id, p_expected_version: order.version });
  if (error) throw new Error(error.message);
}
export async function reviewOrder(order: Order, decision: string, note: string) {
  const { error } = await client().rpc("pmr_review_order", { p_order: order.id, p_expected_version: order.version, p_decision: decision, p_note: note });
  if (error) throw new Error(error.message);
}
export async function beginCapture(orderId: string, group: string, fix: Fix, approval?: string) {
  const { data, error } = await client().rpc("pmr_begin_capture", { p_order: orderId, p_group: group, p_fix: fix, p_source: approval ? "gallery" : "capture", p_approval: approval ?? null });
  if (error) throw new Error(error.message);
  return data as { id: string; issued_at: string; expires_at: string };
}

export async function retryAnalysis(e: Evidence) {
  const { data, error } = await client().functions.invoke("evidence-ingest", { body: { reanalyze: e.id } });
  if (error || data?.error) throw new Error(data?.error ?? "Analysis retry failed.");
}
export async function setTeamMember(team: string, region: string, email: string, enabled: boolean) {
  const { error } = await client().rpc("pmr_set_team_member", { p_team: team, p_region: region, p_email: email, p_enabled: enabled });
  if (error) throw new Error(error.message);
}
export async function promoteSchedules() {
  const { error } = await client().rpc("pmr_promote_ready_schedules"); if (error) throw new Error(error.message);
}
export async function savePolicy(policy: unknown) {
  const { error } = await client().rpc("pmr_save_quality_policy", { p_policy: policy }); if (error) throw new Error(error.message);
}
export async function scheduleIssues() {
  const { data, error } = await client().rpc("pmr_schedule_issues"); if (error) throw new Error(error.message);
  return data as {site_id:string;date:string;team:string;state:string;errors:string[]}[];
}

export async function setGeneratorCount(order: Order, count: number) {
  const { data, error } = await client().rpc("pmr_set_generator_count", { p_order: order.id, p_expected_version: order.version, p_count: count });
  if (error) throw new Error(error.message);
  return data as Order;
}

export async function createAdminTest(order: Order) {
 const { data, error } = await client().rpc("pmr_create_admin_test", { p_order: order.id });
 if (error) throw new Error(error.message);
 return data as Order;
}

export type GroupSubmission = { order_id:string; group_id:string; status:EtlStatus; remarks:string; measurements:Record<string, number>; revision:number; field_checks?: Record<string, EtlStatus>; generator_state?: string | null };
export type Measurements = Partial<Record<"temperature_c"|"dc_busbar_v"|"bbu_v"|"ac_v",number>>;
export async function saveEquipmentGroup(
  orderId: string, groupId: string, checks: Record<string, EtlStatus>, remarks: string,
  measurements: Record<string, number>, generatorState: string | null, revision: number,
) {
  const { data, error } = await client().rpc("pmr_save_equipment_group", {
    p_order: orderId, p_group: groupId, p_checks: checks,
    p_remarks: remarks, p_measurements: measurements, p_generator_state: generatorState, p_revision: revision,
  });
  if (error) throw new Error(error.message);
  return data as GroupSubmission;
}
export type Profile = { name:string; mobile:string; locale:import("./i18n").Locale; avatar_path:string|null };
export async function loadProfile() {
 const {data:auth,error:authError}=await client().auth.getUser();if(authError||!auth.user)throw new Error("Sign in again.");
 const {data,error}=await client().from("pmr_profiles").select("name,mobile,locale,avatar_path").eq("user_id",auth.user.id).maybeSingle();
 if(error)throw new Error(error.message);return data as Profile|null;
}
export async function saveProfile(profile:Profile) {
 const {data,error}=await client().rpc("pmr_save_profile",{p_name:profile.name,p_mobile:profile.mobile,p_locale:profile.locale,p_avatar:profile.avatar_path});
 if(error)throw new Error(error.message);return data as Profile;
}
export async function profileImageUrl(path:string) {
 const {data,error}=await client().storage.from("pmr-profiles").createSignedUrl(path,300);if(error)throw new Error(error.message);return data.signedUrl;
}
export async function uploadAvatar(uri:string) {
 const {data:auth,error:authError}=await client().auth.getUser();if(authError||!auth.user)throw new Error("Sign in again.");
 const {File}=await import("expo-file-system");const {randomUUID}=await import("expo-crypto");
 const path=`${auth.user.id}/${randomUUID()}.jpg`;const bytes=await new File(uri).bytes();
 if(bytes.length>2097152)throw new Error("Profile photo is too large.");
 const {error}=await client().storage.from("pmr-profiles").upload(path,bytes,{contentType:"image/jpeg",upsert:false});
 if(error)throw new Error(error.message);return path;
}
