import { Directory, File, Paths } from "expo-file-system";
import { supabase } from "./supabase";
import { supabasePublishableKey, supabaseUrl } from "./config";
import { sha256Hex } from "./evidence";

export type LocalEvidence = {
  evidenceId: string; orderId: string; siteId: string; groupId: string; linkedEtls: number[];
  technician: string; team: string; capturedAtUtc: string; width: number; height: number;
  source?: "capture" | "gallery"; approvalId?: string | null;
  capturedAtSource?: "device-camera" | "exif";
  gps: { latitude: number; longitude: number; accuracy: number; timestamp: string };
  original: { path: string; sha256: string }; derivative: { path: string; sha256: string };
  uploadState: "queued" | "uploading" | "uploaded" | "blocked" | "retry" | "pending_backend_ingest";
  attempts?: number; nextAttemptAt?: number; lastError?: string; uploadedAt?: string;
};
export const retryDelay = (attempt: number) => Math.min(300000, 2000 * 2 ** Math.min(attempt, 8));
const root = () => new Directory(Paths.document, "evidence");
let running: Promise<void> | null = null;

export async function queuedEvidence(email: string): Promise<LocalEvidence[]> {
  if (!root().exists) return [];
  const result: LocalEvidence[] = [];
  for (const dir of root().list()) {
    if (!(dir instanceof Directory)) continue;
    let file = new File(dir, "metadata.json");
    if (!file.exists) file = new File(dir, "metadata.next.json");
    if (!file.exists) continue;
    try {
      const row = JSON.parse(await file.text()) as LocalEvidence;
      if (row.technician?.toLowerCase() === email.toLowerCase()) result.push(row);
    } catch { /* A partial local record is never uploaded. Original files remain for recovery. */ }
  }
  return result.sort((a, b) => a.capturedAtUtc.localeCompare(b.capturedAtUtc));
}
async function save(row: LocalEvidence) {
  const dir = new Directory(root(), row.evidenceId);
  const pending = new File(dir, "metadata.next.json");
  pending.write(JSON.stringify(row));
  const current = new File(dir, "metadata.json");
  if (current.exists) current.delete();
  pending.move(current);
}
export async function retryEvidence(email: string) {
  if (running) await running;
  for (const row of await queuedEvidence(email)) {
    if (row.uploadState !== "uploaded") await save({ ...row, uploadState: "queued", nextAttemptAt: 0 });
  }
  await flushEvidence(email);
}
export function flushEvidence(email: string): Promise<void> {
  if (running) return running;
  running = drain(email).finally(() => { running = null; });
  return running;
}
async function drain(email: string) {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.email?.toLowerCase() !== email.toLowerCase()) return;
  for (const row of await queuedEvidence(email)) {
    if (row.uploadState === "uploaded" || row.uploadState === "blocked" || (row.nextAttemptAt ?? 0) > Date.now()) continue;
    const attempts = (row.attempts ?? 0) + 1;
    await save({ ...row, uploadState: "uploading", attempts });
    let retryable = true;
    try {
      if (!row.width || !row.height) throw new Error("This older capture needs to be retaken: image dimensions missing.");
      const original = new File(row.original.path), stamped = new File(row.derivative.path);
      if (await sha256Hex(original) !== row.original.sha256 || await sha256Hex(stamped) !== row.derivative.sha256) {
        retryable = false;
        throw new Error("Local photo changed after capture. Retake this photo.");
      }
      const form = new FormData();
      form.append("metadata", JSON.stringify({
        order_id: row.orderId, group_id: row.groupId, instance: row.groupId,
        source: row.source ?? "capture", approval_id: row.approvalId ?? null,
        capture_id: row.evidenceId, captured_at: row.capturedAtUtc,
        captured_at_source: row.capturedAtSource ?? "device-camera", gps: row.gps,
        linked_etls: row.linkedEtls, width: row.width, height: row.height,
      }));
      form.append("original", { uri: original.uri, name: "original.jpg", type: "image/jpeg" } as unknown as Blob);
      form.append("stamped", { uri: stamped.uri, name: "stamped.jpg", type: "image/jpeg" } as unknown as Blob);
      const response = await fetch(`${supabaseUrl}/functions/v1/evidence-ingest`, {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabasePublishableKey },
        body: form, signal: AbortSignal.timeout(90000),
      });
      if (!response.ok) {
        retryable = response.status === 401 || response.status === 408 || response.status === 429 || response.status >= 500;
        const error = await response.json().catch(() => ({}));
        throw new Error(typeof error.error === "string" ? error.error : `Upload failed (${response.status}).`);
      }
      await save({ ...row, uploadState: "uploaded", attempts, uploadedAt: new Date().toISOString(), lastError: undefined });
    } catch (error) {
      await save({ ...row, uploadState: retryable ? "retry" : "blocked", attempts,
        nextAttemptAt: Date.now() + retryDelay(attempts), lastError: (error as Error).message.slice(0, 300) });
    }
  }
}
