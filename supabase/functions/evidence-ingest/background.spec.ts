import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformWithEsbuild } from "vite";
import { describe, expect, it, vi } from "vitest";
async function runIngest({ provider = true, registerFails = false } = {}) {
  let handler: (r: Request) => Promise<Response>;
  const events: string[] = [],
    waitUntil = vi.fn(),
    analyze = vi.fn();
  const meta = {
    capture_id: "capture-test",
    order_id: "order-test",
    group_id: "O01",
    source: "capture",
    approval_id: null,
    linked_etls: [1],
    captured_at: "2026-11-03T12:00:00Z",
    captured_at_source: "device-camera",
    gps: { latitude: 24, longitude: 46, accuracy: 5 },
  };
  const rpc = vi.fn(async (name: string) => {
    events.push(name);
    return {
      error:
        name === "pmr_register_evidence" && registerFails
          ? { message: "Registration failed" }
          : null,
      data:
        name === "pmr_capture_context"
          ? {
              order: {
                id: meta.order_id,
                assignee: "technician@example.com",
                team: "Demo",
                site_id: "DEMO", wo: "WO-DEMO", tcn: "TCN-DEMO",
                checklist: [
                  { id: "O01", title: "Test group", etls: [{ number: 1 }] },
                ],
                tcn_start: "2026-11-03T00:00:00Z",
                tcn_end: "2026-11-04T00:00:00Z",
                inventory: {},
              },
              capture: {
                order_id: meta.order_id,
                group_id: "O01",
                source: "capture",
                approval_id: null,
                issued_at: "2026-11-03T11:59:59Z",
                expires_at: "2026-11-03T12:05:00Z",
                gps: meta.gps,
              },
            }
          : name === "pmr_get_ingest_key"
            ? "test-signing-key"
            : null,
    };
  });
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "test-user" } } }) },
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
    storage: {
      from: () => ({
        upload: async () => {
          events.push("stored");
          return { error: null };
        },
      }),
    },
  };
  const context = {
    Request,
    Response,
    File,
    Blob,
    Uint8Array,
    Date,
    JSON,
    Number,
    String,
    AbortSignal,
    console,
    fetch: vi.fn(() => {
      events.push("background");
      return new Promise<Response>(() => {});
    }),
    EdgeRuntime: { waitUntil },
    Deno: {
      env: {
        toObject: () => ({
          SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_ANON_KEY: "test-public",
          SUPABASE_SERVICE_ROLE_KEY: "test-service",
        }),
      },
      serve: (h: typeof handler) => {
        handler = h;
      },
    },
    createClient: () => client,
    parseMetadata: () => meta,
    checkFile: () => "image/jpeg",
    sha256Hex: async () => "test-sha",
    bucket: "test-private",
    objectPath: () => "test-path",
    decode: () => ({ width: 1920, height: 1080, data: new Uint8Array(4) }),
    imageMetrics: () => ({ perceptualHash: "test-hash" }),
    originalExif: async () => null,
    stampImage: () => new Uint8Array([1]),
    visionProvider: () => (provider ? { name: "test-provider" } : null),
    analyzeEvidence: analyze,
    buildPayload: (p: unknown) => JSON.stringify(p),
    hmacSha256Hex: async () => "test-signature",
    IngestError: class extends Error {
      constructor(
        public status: number,
        message: string,
      ) {
        super(message);
      }
    },
  };
  const source = readFileSync(
    new URL("./index.ts", import.meta.url),
    "utf8",
  ).replace(/^import .*;\n/gm, "");
  vm.runInNewContext(
    (
      await transformWithEsbuild(source, "index.ts", {
        loader: "ts",
        target: "es2022",
      })
    ).code,
    context,
  );
  const form = new FormData();
  form.append("metadata", JSON.stringify(meta));
  form.append(
    "original",
    new File([new Uint8Array([255, 216, 255])], "original.jpg", {
      type: "image/jpeg",
    }),
  );
  const response = await handler!(
    new Request("https://example.supabase.co/functions/v1/evidence-ingest", {
      method: "POST",
      headers: { Authorization: "Bearer test-session" },
      body: form,
    }),
  );
  return { response, waitUntil, analyze, events };
}
describe("upload acknowledgement before independent QC", () => {
  it("registers stored evidence before scheduling QC and responds without waiting for the provider", async () => {
    const r = await runIngest();
    expect(r.response.status).toBe(201);
    expect((await r.response.json()).analysis).toBe("unavailable");
    expect(r.analyze).not.toHaveBeenCalled();
    expect(r.waitUntil).toHaveBeenCalledTimes(1);
    expect(r.events.indexOf("pmr_register_evidence")).toBeLessThan(
      r.events.indexOf("background"),
    );
    expect(r.events.filter((e) => e === "stored")).toHaveLength(2);
  });
  it("preserves pending analysis without a configured provider", async () => {
    const r = await runIngest({ provider: false });
    expect(r.response.status).toBe(201);
    expect(r.waitUntil).not.toHaveBeenCalled();
    expect(r.analyze).not.toHaveBeenCalled();
  });
  it("does not start background analysis for rejected registration", async () => {
    const r = await runIngest({ registerFails: true });
    expect(r.response.status).toBe(422);
    expect(r.waitUntil).not.toHaveBeenCalled();
  });
});
