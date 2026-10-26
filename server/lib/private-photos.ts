import { createHash } from "node:crypto";

import {
  getPrivateBlobStorageReadinessForRequest,
  putPrivateBlob,
  readPrivateBlob,
  type PrivateBlobHandle,
} from "@agent-native/core/private-blob";

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export const PRIVATE_STORAGE_SETUP_MESSAGE =
  "Private photo storage is not configured. Connect a Builder account with asset-write access or an approved private blob provider, then retry. Evidence was not saved.";

export class PrivateStorageUnavailableError extends Error {
  constructor() {
    super(PRIVATE_STORAGE_SETUP_MESSAGE);
    this.name = "PrivateStorageUnavailableError";
  }
}

type DetectedImage = { mimeType: "image/jpeg" | "image/png" | "image/webp" };

export function detectImageType(bytes: Uint8Array): DetectedImage | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { mimeType: "image/png" };
  }
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) {
    return { mimeType: "image/webp" };
  }
  return null;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface StoredPhoto {
  handle: PrivateBlobHandle;
  sha256: string;
  mimeType: DetectedImage["mimeType"];
  size: number;
}

export async function storePrivatePhoto(input: {
  bytes: Uint8Array;
  ownerEmail: string;
  workOrderId: string;
  checklistItemIds: string[];
}): Promise<StoredPhoto> {
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new Error("Photo must be between 1 byte and 15 MB.");
  }
  const type = detectImageType(input.bytes);
  if (!type) throw new Error("Only JPEG, PNG or WebP photos are accepted.");

  const readiness = await getPrivateBlobStorageReadinessForRequest();
  if (!readiness.configured) throw new PrivateStorageUnavailableError();

  const sha256 = sha256Hex(input.bytes);
  const handle = await putPrivateBlob({
    data: input.bytes,
    ownerEmail: input.ownerEmail,
    mimeType: type.mimeType,
    filename: `${sha256}.${type.mimeType.split("/")[1]}`,
    metadata: {
      workOrderId: input.workOrderId,
      checklistItemIds: input.checklistItemIds.join(","),
      sha256,
    },
  });
  if (!handle) throw new PrivateStorageUnavailableError();

  return { handle, sha256, mimeType: type.mimeType, size: input.bytes.byteLength };
}

export async function readStoredPhoto(handle: PrivateBlobHandle) {
  return readPrivateBlob(handle);
}
