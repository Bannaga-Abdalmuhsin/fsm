import { Directory, File, Paths } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { supabase } from "./supabase";
import { supabasePublishableKey, supabaseUrl } from "./config";
import { sha256Hex } from "./evidence";

export type LocalEvidence = {
  evidenceId: string;
  orderId: string;
  siteId: string;
  groupId: string;
  linkedEtls: number[];
  technician: string;
  team: string;
  capturedAtUtc: string;
  width: number;
  height: number;
  source?: "capture" | "gallery";
  approvalId?: string | null;
  capturedAtSource?: "device-camera" | "exif";
  gps: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: string;
  };
  original: { path: string; sha256: string };
  derivative: { path: string; sha256: string };
  uploadState:
    | "queued"
    | "uploading"
    | "uploaded"
    | "blocked"
    | "retry"
    | "pending_backend_ingest";
  supersededBy?: string;
  attempts?: number;
  nextAttemptAt?: number;
  lastError?: string;
  uploadedAt?: string;
};
export const retryDelay = (attempt: number) =>
  Math.min(300000, 2000 * 2 ** Math.min(attempt, 8));
const root = () => new Directory(Paths.document, "evidence");
let running: Promise<void> | null = null;
const listeners = new Set<(email: string) => void>();
export function subscribeEvidence(listener: (email: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

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
      if (row.technician?.toLowerCase() === email.toLowerCase())
        result.push({
          ...row,
          original: {
            ...row.original,
            path: new File(dir, "original.jpg").uri,
          },
          derivative: {
            ...row.derivative,
            path: new File(dir, "derivative.jpg").uri,
          },
        });
    } catch {
      /* A partial local record is never uploaded. Original files remain for recovery. */
    }
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
  for (const listener of listeners) listener(row.technician);
}
export async function retryEvidence(
  email: string,
  groupId?: string,
  orderId?: string,
) {
  if (running) await running;
  for (const row of await queuedEvidence(email)) {
    if (
      !row.supersededBy &&
      row.uploadState !== "uploaded" &&
      (!groupId || row.groupId === groupId) &&
      (!orderId || row.orderId === orderId)
    )
      await save({ ...row, uploadState: "queued", nextAttemptAt: 0 });
  }
  await flushEvidence(email);
}
export function flushEvidence(email: string): Promise<void> {
  if (running) return running;
  running = drain(email).finally(() => {
    running = null;
  });
  return running;
}
async function drain(email: string) {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session || session.user.email?.toLowerCase() !== email.toLowerCase())
    return;
  for (const row of await queuedEvidence(email)) {
    if (
      row.supersededBy ||
      row.uploadState === "uploaded" ||
      row.uploadState === "blocked" ||
      (row.nextAttemptAt ?? 0) > Date.now()
    )
      continue;
    const attempts = (row.attempts ?? 0) + 1;
    await save({ ...row, uploadState: "uploading", attempts });
    let retryable = true;
    try {
      if (!row.width || !row.height) {
        retryable = false;
        throw new Error(
          "Retake required: this older capture has no image dimensions.",
        );
      }
      const original = new File(row.original.path),
        stamped = new File(row.derivative.path);
      if (!original.exists || !stamped.exists) {
        retryable = false;
        throw new Error(
          "Retake required: the original or stamped photo is no longer on this device.",
        );
      }
      const [originalSha, stampedSha] = await Promise.all([
        sha256Hex(original),
        sha256Hex(stamped),
      ]);
      if (
        originalSha !== row.original.sha256 ||
        stampedSha !== row.derivative.sha256
      ) {
        retryable = false;
        throw new Error(
          "Local photo changed after capture. Retake this photo.",
        );
      }
      const form = new FormData();
      form.append(
        "metadata",
        JSON.stringify({
          order_id: row.orderId,
          group_id: row.groupId,
          instance: row.groupId,
          source: row.source ?? "capture",
          approval_id: row.approvalId ?? null,
          capture_id: row.evidenceId,
          captured_at: row.capturedAtUtc,
          captured_at_source: row.capturedAtSource ?? "device-camera",
          gps: row.gps,
          linked_etls: row.linkedEtls,
          width: row.width,
          height: row.height,
        }),
      );
      form.append("original", original);
      // The server generates the canonical timestamp/GPS derivative from the verified original.
      // Keep the local stamped copy, but do not upload redundant bytes.
      const response = await expoFetch(
        `${supabaseUrl}/functions/v1/evidence-ingest`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: supabasePublishableKey,
          },
          body: form,
          signal: AbortSignal.timeout(90000),
        },
      );
      if (!response.ok) {
        retryable =
          response.status === 401 ||
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;
        const error = await response.json().catch(() => ({}));
        throw new Error(
          typeof error.error === "string"
            ? error.error
            : `Upload failed (${response.status}).`,
        );
      }
      await save({
        ...row,
        uploadState: "uploaded",
        attempts,
        uploadedAt: new Date().toISOString(),
        lastError: undefined,
      });
    } catch (error) {
      await save({
        ...row,
        uploadState: retryable ? "retry" : "blocked",
        attempts,
        nextAttemptAt: Date.now() + retryDelay(attempts),
        lastError: (error as Error).message.slice(0, 300),
      });
    }
  }
}

// Retaking an unrecoverable local capture preserves its metadata, but stops futile retries.
// Uploaded evidence and recoverable originals are never removed or replaced here.
export async function replaceMissingCaptures(
  email: string,
  orderId: string,
  groupId: string,
  replacementId: string,
) {
  for (const row of await queuedEvidence(email)) {
    if (
      row.orderId !== orderId ||
      row.groupId !== groupId ||
      row.evidenceId === replacementId ||
      row.uploadState === "uploaded" ||
      row.supersededBy
    )
      continue;
    if (
      !new File(row.original.path).exists ||
      !new File(row.derivative.path).exists ||
      (row.uploadState === "blocked" &&
        /Retake required|Image cannot be decoded or exceeds 16 megapixels/.test(
          row.lastError ?? "",
        ))
    )
      await save({ ...row, supersededBy: replacementId });
  }
}
