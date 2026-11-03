import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as Location from "expo-location";

import { supabaseUrl, supabasePublishableKey } from "./config";
import type { Fix } from "./api";

export type ClockOffset = {
  offsetMs: number;
  uncertaintyMs: number;
  measuredAt: string;
};

export async function ensureLocationPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  const requested = await Location.requestForegroundPermissionsAsync();
  return requested.granted;
}

export async function getFix(offsetMs = 0): Promise<Fix> {
  if (!(await ensureLocationPermission())) {
    throw new Error("Location permission is required to capture evidence.");
  }
  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error("Enable GPS/location services to capture evidence.");
  // Reuse only a recent accurate native fix. Preserve its actual timestamp.
  const recent = await Location.getLastKnownPositionAsync({
    maxAge: 10000,
    requiredAccuracy: 50,
  });
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const location =
    recent ??
    (await (async () => {
      try {
        return await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          }),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(
              () =>
                reject(
                  new Error(
                    "GPS is taking too long. Move to open sky and retry.",
                  ),
                ),
              15000,
            );
          }),
        ]);
      } finally {
        if (deadline) clearTimeout(deadline);
      }
    })());
  if (location.mocked)
    throw new Error("Simulated or mock GPS detected. Capture is blocked.");
  const { latitude, longitude, accuracy } = location.coords;
  if (accuracy == null)
    throw new Error("GPS accuracy is unavailable. Move to open sky and retry.");
  return {
    latitude,
    longitude,
    accuracy,
    timestamp: new Date(location.timestamp + offsetMs).toISOString(),
  };
}

// Compares the phone clock with the Supabase server Date header. HTTP dates have one-second
// resolution, so the uncertainty includes that rounding plus half the round-trip time.
let cachedClock: ClockOffset | null = null;
export async function measureClockOffset(): Promise<ClockOffset> {
  if (cachedClock && Date.now() - Date.parse(cachedClock.measuredAt) < 30000)
    return cachedClock;
  const before = Date.now();
  const response = await fetch(`${supabaseUrl}/rest/v1/`, {
    method: "HEAD",
    signal: AbortSignal.timeout(8000),
    headers: { apikey: supabasePublishableKey },
  });
  const after = Date.now();
  const serverDate = response.headers.get("date");
  const serverMs = serverDate ? Date.parse(serverDate) : NaN;
  if (!Number.isFinite(serverMs))
    throw new Error("Server time header missing; clock offset not measured.");
  cachedClock = {
    offsetMs: serverMs - (before + after) / 2,
    uncertaintyMs: (after - before) / 2 + 1000,
    measuredAt: new Date(after).toISOString(),
  };
  return cachedClock;
}

export function evidenceDirectory(evidenceId: string) {
  const dir = new Directory(Paths.document, "evidence", evidenceId);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export async function sha256Hex(file: File) {
  const bytes = await file.bytes();
  const digest = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    bytes,
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
