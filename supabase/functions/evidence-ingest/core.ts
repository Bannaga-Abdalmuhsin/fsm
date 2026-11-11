export const maxFileBytes = 15 * 1024 * 1024;
export const bucket = "pmr-evidence";

export type Mime = "image/jpeg" | "image/png" | "image/webp";
const extensions: Record<Mime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class IngestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type IngestMetadata = {
  order_id: string;
  group_id: string;
  instance: string;
  source: "capture" | "gallery";
  approval_id: string | null;
  capture_id: string;
  captured_at: string;
  captured_at_source: "exif" | "device-camera";
  gps: Record<string, unknown>;
  linked_etls: number[];
  width: number;
  height: number;
};

export function parseMetadata(raw: unknown): IngestMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new IngestError(400, "Metadata must be a JSON object");
  }
  const m = raw as Record<string, unknown>;
  const text = (key: string, pattern: RegExp) => {
    const value = m[key];
    if (typeof value !== "string" || !pattern.test(value)) {
      throw new IngestError(400, `Invalid ${key}`);
    }
    return value;
  };
  const source = m.source;
  if (source !== "capture" && source !== "gallery") throw new IngestError(400, "Invalid source");
  const approvalId = m.approval_id ?? null;
  if (approvalId !== null && (typeof approvalId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(approvalId))) {
    throw new IngestError(400, "Invalid approval_id");
  }
  if (source === "capture" && approvalId !== null) throw new IngestError(400, "Camera capture cannot use an approval");
  if (source === "gallery" && approvalId === null) throw new IngestError(400, "Gallery photos need an approval");
  const capturedAt = m.captured_at;
  if (typeof capturedAt !== "string" || Number.isNaN(Date.parse(capturedAt))) {
    throw new IngestError(400, "Invalid captured_at");
  }
  const capturedSource = m.captured_at_source;
  if (capturedSource !== "exif" && capturedSource !== "device-camera") {
    throw new IngestError(400, "Invalid captured_at_source");
  }
  if (!m.gps || typeof m.gps !== "object" || Array.isArray(m.gps)) throw new IngestError(400, "Invalid gps");
  if (JSON.stringify(m.gps).length > 2000) throw new IngestError(400, "gps is too large");
  const etls = m.linked_etls;
  if (!Array.isArray(etls) || etls.length === 0 || etls.length > 20
    || etls.some((n) => !Number.isInteger(n) || (n as number) < 1 || (n as number) > 999)) {
    throw new IngestError(400, "Invalid linked_etls");
  }
  const dimension = (value: unknown) => {
    if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 20000) {
      throw new IngestError(400, "Invalid image dimensions");
    }
    return value as number;
  };
  return {
    order_id: text("order_id", /^[A-Za-z0-9_-]{1,64}$/),
    group_id: text("group_id", /^[A-Za-z0-9_.-]{1,40}$/),
    instance: text("instance", /^[A-Za-z0-9_.-]{1,20}$/),
    source,
    approval_id: approvalId,
    capture_id: text("capture_id", /^[A-Za-z0-9-]{8,64}$/),
    captured_at: new Date(capturedAt).toISOString(),
    captured_at_source: capturedSource,
    gps: m.gps as Record<string, unknown>,
    linked_etls: etls as number[],
    width: dimension(m.width),
    height: dimension(m.height),
  };
}

export function detectMime(bytes: Uint8Array): Mime {
  const startsWith = (sig: number[], offset = 0) =>
    sig.every((byte, i) => bytes[offset + i] === byte);
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  throw new IngestError(415, "Only JPEG, PNG, or WebP images are accepted");
}

export function checkFile(bytes: Uint8Array, declaredMime: string): Mime {
  if (bytes.byteLength === 0 || bytes.byteLength > maxFileBytes) {
    throw new IngestError(413, "Image is empty or larger than 15 MB");
  }
  const actual = detectMime(bytes);
  if (declaredMime !== actual) throw new IngestError(415, "Image type does not match its content");
  return actual;
}

export function objectPath(orderId: string, captureId: string, mime: Mime, stamped: boolean) {
  const ext = extensions[mime];
  return stamped
    ? `${orderId}/${captureId}.stamped.${ext}`
    : `${orderId}/${captureId}.${ext}`;
}

export async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret: string, text: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type AnalysisResult =
  | { status: "unavailable"; provider: string | null; reason: string }
  | { status: "complete"; provider: string; findings: unknown[]; quality: Record<string, unknown>; ocr_text?: string };

export interface VisionProvider {
  readonly name: string;
  analyze(input: { bytes: Uint8Array; mime: Mime; linkedEtls: number[] }): Promise<Omit<Extract<AnalysisResult, { status: "complete" }>, "provider">>;
}

export function selectVisionProvider(
  env: Record<string, string | undefined>,
  adapters: Record<string, VisionProvider> = {},
): { provider: VisionProvider | null; unavailableReason: string | null; providerName: string | null } {
  const name = env.PMR_VISION_PROVIDER?.trim();
  if (!name) {
    return { provider: null, unavailableReason: "No vision provider is configured", providerName: null };
  }
  const adapter = adapters[name];
  if (!adapter) {
    return { provider: null, unavailableReason: `Vision provider ${name} has no adapter in this deployment`, providerName: name };
  }
  return { provider: adapter, unavailableReason: null, providerName: name };
}

export async function analyzeEvidence(
  provider: VisionProvider | null,
  providerName: string | null,
  unavailableReason: string | null,
  input: { bytes: Uint8Array; mime: Mime; linkedEtls: number[] },
): Promise<AnalysisResult> {
  if (!provider) {
    return { status: "unavailable", provider: providerName, reason: unavailableReason ?? "No vision provider is configured" };
  }
  const result = await provider.analyze(input);
  return { status: "complete", provider: provider.name, findings: result.findings, quality: result.quality, ocr_text: result.ocr_text };
}

export function buildPayload(input: {
  meta: IngestMetadata;
  sha: string;
  derivativeSha: string;
  mime: Mime;
  originalPath: string;
  derivativePath: string;
  analysis: AnalysisResult;
  perceptualHash?: string;
}) {
  const { meta, analysis } = input;
  return JSON.stringify({
    order_id: meta.order_id,
    group_id: meta.group_id,
    instance: meta.instance,
    source: meta.source,
    approval_id: meta.approval_id,
    capture_id: meta.capture_id,
    captured_at: meta.captured_at,
    captured_at_source: meta.captured_at_source,
    gps: meta.gps,
    sha: input.sha,
    perceptual_hash: input.perceptualHash ?? "",
    handle: {
      bucket,
      path: input.originalPath,
      derivative: { bucket, path: input.derivativePath, sha256: input.derivativeSha },
    },
    mime: input.mime,
    width: meta.width,
    height: meta.height,
    findings: analysis.status === "complete" ? analysis.findings : [],
    quality: analysis.status === "complete" ? analysis.quality : { score: null, provisional: true, dimensions: {} },
    analysis,
    state: analysis.status === "complete" && analysis.findings.some((f) => (f as {severity?:string}).severity === "block") ? "Retake required" : analysis.status === "complete" ? "Supervisor review" : "Pending analysis",
    linked_etls: meta.linked_etls,
  });
}
