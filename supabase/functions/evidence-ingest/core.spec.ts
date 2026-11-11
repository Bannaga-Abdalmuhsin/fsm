import { createHash, createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  analyzeEvidence,
  buildPayload,
  checkFile,
  detectMime,
  hmacSha256Hex,
  IngestError,
  objectPath,
  parseMetadata,
  selectVisionProvider,
  sha256Hex,
  type VisionProvider,
} from "./core.ts";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

const validMeta = {
  order_id: "ord-1",
  group_id: "g1",
  instance: "1",
  source: "capture",
  approval_id: null,
  capture_id: "11111111-2222-3333-4444-555555555555",
  captured_at: "2026-10-01T08:00:00.000Z",
  captured_at_source: "device-camera",
  gps: { latitude: 24.7, longitude: 46.7, accuracy: 5, timestamp: "2026-10-01T08:00:00.000Z" },
  linked_etls: [1, 2],
  width: 1200,
  height: 900,
};

describe("image checks", () => {
  it("detects JPEG, PNG, and WebP by signature", () => {
    expect(detectMime(jpeg)).toBe("image/jpeg");
    expect(detectMime(png)).toBe("image/png");
    expect(detectMime(webp)).toBe("image/webp");
  });

  it("rejects non-image bytes and declared types that do not match the content", () => {
    expect(() => detectMime(new TextEncoder().encode("hello"))).toThrow(IngestError);
    expect(() => checkFile(jpeg, "image/png")).toThrow(/does not match/);
    expect(() => checkFile(new Uint8Array(0), "image/jpeg")).toThrow(/empty/);
    expect(checkFile(jpeg, "image/jpeg")).toBe("image/jpeg");
  });

  it("builds object paths under the order prefix", () => {
    expect(objectPath("ord-1", "cap-123456", "image/webp", false)).toBe("ord-1/cap-123456.webp");
    expect(objectPath("ord-1", "cap-123456", "image/jpeg", true)).toBe("ord-1/cap-123456.stamped.jpg");
  });
});

describe("server-side hashing and signing", () => {
  it("hashes the original bytes with SHA-256", async () => {
    const bytes = new TextEncoder().encode("abc");
    expect(await sha256Hex(bytes)).toBe(createHash("sha256").update("abc").digest("hex"));
  });

  it("produces the HMAC that pmr_register_evidence verifies over the exact payload text", async () => {
    const payload = JSON.stringify({ order_id: "ord-1", capture_id: "c1" });
    const expected = createHmac("sha256", "secret-value").update(payload).digest("hex");
    expect(await hmacSha256Hex("secret-value", payload)).toBe(expected);
  });
});

describe("metadata validation", () => {
  it("accepts a camera capture", () => {
    expect(parseMetadata(validMeta).linked_etls).toEqual([1, 2]);
  });

  it("requires an approval for gallery photos and forbids one for camera captures", () => {
    expect(() => parseMetadata({ ...validMeta, source: "gallery" })).toThrow(/need an approval/);
    expect(() => parseMetadata({ ...validMeta, approval_id: "abcdef12-0000-0000-0000-000000000000" })).toThrow(
      /cannot use an approval/,
    );
  });

  it("rejects malformed identifiers, ETL links, and gps", () => {
    expect(() => parseMetadata({ ...validMeta, order_id: "../etc" })).toThrow(/order_id/);
    expect(() => parseMetadata({ ...validMeta, capture_id: "x" })).toThrow(/capture_id/);
    expect(() => parseMetadata({ ...validMeta, linked_etls: [] })).toThrow(/linked_etls/);
    expect(() => parseMetadata({ ...validMeta, linked_etls: [1000] })).toThrow(/linked_etls/);
    expect(() => parseMetadata({ ...validMeta, gps: [] })).toThrow(/gps/);
  });
});

describe("analysis and payload", () => {
  const meta = parseMetadata(validMeta);
  const common = {
    meta,
    sha: "a".repeat(64),
    derivativeSha: "b".repeat(64),
    mime: "image/jpeg" as const,
    originalPath: "ord-1/c.jpg",
    derivativePath: "ord-1/c.stamped.jpg",
  };

  it("reports analysis as unavailable when no vision provider is configured", async () => {
    const selection = selectVisionProvider({});
    const analysis = await analyzeEvidence(selection.provider, selection.providerName, selection.unavailableReason, {
      bytes: jpeg,
      mime: "image/jpeg",
      linkedEtls: [1],
    });
    expect(analysis).toEqual({
      status: "unavailable",
      provider: null,
      reason: "No vision provider is configured",
    });
    const payload = JSON.parse(buildPayload({ ...common, analysis }));
    expect(payload.state).toBe("Pending analysis");
    expect(payload.quality.score).toBeNull();
    expect(payload.findings).toEqual([]);
  });

  it("names a configured provider that has no adapter without inventing a result", () => {
    const selection = selectVisionProvider({ PMR_VISION_PROVIDER: "unknown-model" });
    expect(selection.provider).toBeNull();
    expect(selection.unavailableReason).toMatch(/no adapter/);
  });

  it("passes adapter output through with the provider name and moves analysed evidence to review", async () => {
    const adapter: VisionProvider = {
      name: "test-adapter",
      analyze: async () => ({ findings: [{ kind: "label-visible" }], quality: { score: 91 } }),
    };
    const selection = selectVisionProvider({ PMR_VISION_PROVIDER: "test-adapter" }, { "test-adapter": adapter });
    const analysis = await analyzeEvidence(selection.provider, selection.providerName, selection.unavailableReason, {
      bytes: jpeg,
      mime: "image/jpeg",
      linkedEtls: [1],
    });
    expect(analysis).toEqual({
      status: "complete",
      provider: "test-adapter",
      findings: [{ kind: "label-visible" }],
      quality: { score: 91 },
    });
    const payload = JSON.parse(buildPayload({ ...common, analysis }));
    expect(payload.state).toBe("Supervisor review");
    expect(payload.handle).toEqual({
      bucket: "pmr-evidence",
      path: "ord-1/c.jpg",
      derivative: { bucket: "pmr-evidence", path: "ord-1/c.stamped.jpg", sha256: "b".repeat(64) },
    });
  });
});
