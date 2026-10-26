import { appPath } from "@agent-native/core/client/api-path";

import type { Geo } from "../../shared/pmr";
export type CaptureMeta = {
  orderId: string;
  groupId: string;
  instance: string;
  captureId: string;
  capturedAt: string;
  gps: Geo;
  source: "camera" | "gallery";
  approvalId?: string;
};
export type Draft = {
  id: string;
  owner: string;
  metadata: CaptureMeta;
  blob: Blob;
  createdAt: string;
};
type Stored = { id: string; owner: string; iv: Uint8Array; bytes: ArrayBuffer };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("fsm-pmr-encrypted", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("drafts", { keyPath: "id" });
      request.result.createObjectStore("keys");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function read<T>(store: string, key?: string): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store);
      const request = key
        ? tx.objectStore(store).get(key)
        : tx.objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
async function put(store: string, value: unknown, key?: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      key
        ? tx.objectStore(store).put(value, key)
        : tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function keyFor(owner: string) {
  let key = await read<CryptoKey | undefined>("keys", owner);
  if (!key) {
    key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    await put("keys", key, owner);
  }
  return key;
}
export async function saveDraft(draft: Draft) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const metadata = new TextEncoder().encode(
    JSON.stringify({
      metadata: draft.metadata,
      mime: draft.blob.type,
      createdAt: draft.createdAt,
    }),
  );
  const body = new Uint8Array(await draft.blob.arrayBuffer());
  const envelope = new Uint8Array(4 + metadata.length + body.length);
  new DataView(envelope.buffer).setUint32(0, metadata.length);
  envelope.set(metadata, 4);
  envelope.set(body, 4 + metadata.length);
  const bytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await keyFor(draft.owner),
    envelope,
  );
  await put("drafts", {
    id: draft.id,
    owner: draft.owner,
    iv,
    bytes,
  } satisfies Stored);
}
async function decrypt(row: Stored) {
  const bytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(row.iv) },
    await keyFor(row.owner),
    row.bytes,
  );
  const length = new DataView(bytes).getUint32(0);
  const payload = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes, 4, length)),
  ) as { metadata: CaptureMeta; mime: string; createdAt: string };
  return {
    ...payload,
    blob: new Blob([bytes.slice(4 + length)], { type: payload.mime }),
  };
}
export async function listDrafts(owner: string) {
  const rows = await read<Stored[]>("drafts");
  return Promise.all(
    rows
      .filter((x) => x.owner === owner)
      .map(async (row) => ({
        id: row.id,
        owner,
        metadata: (await decrypt(row)).metadata,
      })),
  );
}
export async function deleteDraft(id: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      tx.objectStore("drafts").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function syncDrafts(
  owner: string,
  onProgress: (message: string) => void,
) {
  const all = await read<Stored[]>("drafts");
  const rows = all.filter((x) => x.owner === owner);
  let sent = 0;
  for (const row of rows) {
    onProgress(`Syncing ${sent + 1} of ${rows.length}`);
    const { metadata, blob } = await decrypt(row);
    const form = new FormData();
    form.set("metadata", JSON.stringify(metadata));
    form.set("photo", blob, "capture.jpg");
    const response = await fetch(appPath("/api/pmr/upload"), {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
    if (!response.ok) {
      let message = "Upload failed. Your encrypted draft is preserved.";
      try {
        const body = await response.json();
        message = body.message ?? body.statusMessage ?? message;
      } catch {}
      throw new Error(message);
    }
    await deleteDraft(row.id);
    sent++;
  }
  return sent;
}
export async function getFix(): Promise<Geo> {
  if (!navigator.geolocation)
    throw new Error("Location is unavailable on this device.");
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString(),
        }),
      () =>
        reject(
          new Error(
            "Location permission or GPS fix unavailable. Enable location and retry.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    ),
  );
}
