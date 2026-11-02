import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { localizedGroupTitle,useLanguage } from "../i18n";
import { CameraView, useCameraPermissions, type CameraCapturedPicture } from "expo-camera";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import { flushEvidence } from "../uploadQueue";
import { captureRef } from "react-native-view-shot";

import { captureTimeGate, locationGate } from "../../../shared/pmr";
import type { EvidenceGroup } from "../../../shared/checklists";
import { beginCapture, type Order } from "../api";
import { maxAccuracyMeters, siteRadiusMeters } from "../config";
import { stampTime, tcnWindowMissing } from "../domain";
import {
  ensureLocationPermission,
  evidenceDirectory,
  getFix,
  measureClockOffset,
  sha256Hex,
  type ClockOffset,
} from "../evidence";
import { StampedPhoto, type StampedPhotoHandle } from "../components/StampedPhoto";
import { colors, fonts } from "../theme";

type Props = {
  order: Order;
  group: EvidenceGroup;
  email: string;
  team: string;
  galleryApproval?: string;
  onDone: () => void;
};

type Stamp = { uri: string; aspectRatio: number; lines: string[] };

export function CaptureScreen({ order, group, email, team, galleryApproval, onDone }: Props) {
  const {t,locale}=useLanguage();
  const [permission, requestPermission] = useCameraPermissions();
  const { width } = useWindowDimensions();
  const cameraRef = useRef<CameraView>(null);
  const stampRef = useRef<StampedPhotoHandle>(null);
  const imageReadyRef = useRef<(() => void) | null>(null);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [clock, setClock] = useState<ClockOffset | null>(null);
  const [clockError, setClockError] = useState<string | null>(null);
  const [stamp, setStamp] = useState<Stamp | null>(null);
  const [siteReady, setSiteReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureLocationPermission().then(setLocationGranted, () => setLocationGranted(false));
    measureClockOffset()
      .then(setClock)
      .catch((err: Error) => setClockError(err.message));
  }, []);

  useEffect(() => {
    if (!locationGranted || !clock) return;
    let active = true;
    getFix(clock.offsetMs).then((fix) => {
      const gate = locationGate(fix, order.inventory?.admin_test ? { latitude: fix.latitude, longitude: fix.longitude } : order, Date.now() + clock.offsetMs);
      if (!gate.allowed) throw new Error(gate.reason ?? "Location check failed.");
      if (active) setSiteReady(true);
    }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [locationGranted, clock, order.latitude, order.longitude]);

  if (locationGranted === null) return <ActivityIndicator color={colors.action} style={{ flex: 1 }} />;
  if (!locationGranted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>{t("locationRequired")}</Text>
        <Pressable
          onPress={() => ensureLocationPermission().then(setLocationGranted, () => setLocationGranted(false))}
          style={styles.primary}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>{t("locationPermission")}</Text>
        </Pressable>
      </View>
    );
  }

  if (!permission) return <ActivityIndicator color={colors.action} style={{ flex: 1 }} />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>{t("cameraRequired")}</Text>
        <Pressable onPress={requestPermission} style={styles.primary} accessibilityRole="button">
          <Text style={styles.primaryText}>{t("cameraPermission")}</Text>
        </Pressable>
      </View>
    );
  }

  async function captureGroupPhoto() {
    if ((!cameraRef.current && !galleryApproval) || busy) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      if (tcnWindowMissing(order) || !order.tcn_start || !order.tcn_end) {
        throw new Error("TCN setup is incomplete. Capture is blocked.");
      }
      if (!clock) throw new Error("Clock check has not completed. Retry after the server time check.");
      const tcnStart = order.tcn_start;
      const tcnEnd = order.tcn_end;
      if (!tcnStart || !tcnEnd) throw new Error("TCN setup is incomplete. Capture is blocked.");
      const offsetMs = clock.offsetMs;
      const serverNowMs = () => Date.now() + offsetMs;
      const tcnProblem = (atMs: number) =>
        captureTimeGate(new Date(atMs).toISOString(), tcnStart, tcnEnd, new Date(serverNowMs()).toISOString());

      let fix = await getFix(offsetMs);
      const gate = locationGate(fix, order.inventory?.admin_test ? { latitude: fix.latitude, longitude: fix.longitude } : order, serverNowMs());
      if (!gate.allowed) throw new Error(gate.reason ?? "Location check failed.");
      let authorization: Awaited<ReturnType<typeof beginCapture>>;
      let photo: { uri: string; width: number; height: number };
      let capturedAtMs: number;
      if (galleryApproval) {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error("Photo access is required for this approved import.");
        const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], exif: true, quality: 1, allowsEditing: false });
        if (picked.canceled) return;
        const asset = picked.assets[0];
        if (asset.mimeType && asset.mimeType !== "image/jpeg") throw new Error("Approved gallery import currently requires an original JPEG.");
        const exif = asset.exif ?? {};
        const offset = exif.OffsetTimeOriginal;
        const originalTime = exif.DateTimeOriginal;
        if (typeof originalTime !== "string" || typeof offset !== "string" || !/^[+-]\d{2}:\d{2}$/.test(offset)) throw new Error("Gallery image needs original EXIF date, time and timezone.");
        capturedAtMs = Date.parse(originalTime.replace(/^(\d{4}):(\d{2}):(\d{2}) /, "$1-$2-$3T") + offset);
        const coordinate = (value: unknown) => Array.isArray(value) && value.length === 3 ? Number(value[0]) + Number(value[1]) / 60 + Number(value[2]) / 3600 : Number(value);
        const lat = coordinate(exif.GPSLatitude), lng = coordinate(exif.GPSLongitude);
        if (exif.GPSLatitude == null || exif.GPSLongitude == null) throw new Error("Gallery image needs original EXIF GPS coordinates.");
        fix = { latitude: exif.GPSLatitudeRef === "S" ? -Math.abs(lat) : lat, longitude: exif.GPSLongitudeRef === "W" ? -Math.abs(lng) : lng, accuracy: 50, timestamp: new Date(capturedAtMs).toISOString() };
        const originalGate = locationGate(fix, order.inventory?.admin_test ? { latitude: fix.latitude, longitude: fix.longitude } : order, capturedAtMs);
        if (!originalGate.allowed) throw new Error(originalGate.reason ?? "Original photo GPS is outside this site.");
        photo = asset;
        authorization = await beginCapture(order.id, group.id, await getFix(offsetMs), galleryApproval);
      } else {
        const before = tcnProblem(serverNowMs());
        if (before) throw new Error(before);
        authorization = await beginCapture(order.id, group.id, fix);
        const shutterClock = performance.now();
        const captured = await cameraRef.current!.takePictureAsync({ quality: 1, exif: false });
        if (!captured) throw new Error("Camera returned no photo.");
        photo = captured;
        capturedAtMs = Date.parse(authorization.issued_at) + (performance.now() - shutterClock);
      }
      const capturedAt = new Date(capturedAtMs).toISOString();
      const afterShutter = tcnProblem(capturedAtMs);
      if (afterShutter) throw new Error(afterShutter);

      const id = authorization.id;
      const dir = evidenceDirectory(id);
      const original = new File(dir, "original.jpg");
      await new File(photo.uri).copy(original);
      const originalSha256 = await sha256Hex(original);

      const lines = [
        ...(order.inventory?.admin_test ? ["ADMIN REMOTE TEST - NOT OPERATIONAL EVIDENCE"] : []),
        `${stampTime(capturedAtMs)}`,
        `GPS ${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)} ±${Math.round(fix.accuracy)} m`,
        `Site ${order.site_id} | WO ${order.wo ?? "pending"} | TCN ${order.tcn ?? "pending"}`,
        `Group ${group.id} | ETLs ${group.etls.map((e) => e.number).join(", ")}`,
        `Tech ${email} | Team ${team}`,
      ];
      const ready = new Promise<void>((resolve) => {
        imageReadyRef.current = resolve;
      });
      setStamp({ uri: original.uri, aspectRatio: photo.width / photo.height, lines });
      await Promise.race([ready, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Photo preview timed out; retry capture.")), 15000))]);

      const rendered = await captureRef(stampRef, { format: "jpg", quality: 0.92, result: "tmpfile" });
      const derivative = new File(dir, "derivative.jpg");
      await new File(rendered).copy(derivative);
      const derivativeSha256 = await sha256Hex(derivative);

      const metadata = {
        evidenceId: id,
        width: photo.width, height: photo.height, source: galleryApproval ? "gallery" : "capture", approvalId: galleryApproval ?? null, capturedAtSource: galleryApproval ? "exif" : "device-camera",
        orderId: order.id,
        siteId: order.site_id,
        wo: order.wo,
        tcn: order.tcn,
        groupId: group.id,
        linkedEtls: group.etls.map((e) => e.number),
        technician: email,
        team,
        capturedAtUtc: capturedAt,
        capturedAtRiyadh: stampTime(capturedAtMs),
        deviceCapturedAtUtc: new Date(capturedAtMs - offsetMs).toISOString(),
        phoneTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        clockOffset: clock,
        gps: { ...fix, distanceMeters: gate.distance, maxAccuracyMeters, siteRadiusMeters },
        original: { path: original.uri, sha256: originalSha256 },
        derivative: { path: derivative.uri, sha256: derivativeSha256, stampLines: lines },
        uploadState: "queued",
        derivativeNote: "App-generated stamp. It does not prove the original is unmodified.",
      };
      await new File(dir, "metadata.json").write(JSON.stringify(metadata, null, 2));
      setStamp(null);
      setSaved(t("photoQueued"));
      void flushEvidence(email);
    } catch (err) {
      setStamp(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.heading}>
          {group.id} · {localizedGroupTitle(group.title,locale)}
        </Text>
        <Text style={styles.muted}>
          {order.site_id} · ETLs {group.etls.map((e) => e.number).join(", ")}
        </Text>
        <Text style={styles.muted}>
          {clock
            ? `Clock offset ${Math.round(clock.offsetMs)} ms ±${Math.round(clock.uncertaintyMs)} ms vs server`
            : clockError ?? t("checkingClock")}
        </Text>
      </View>

      {siteReady && !galleryApproval ? <CameraView ref={cameraRef} style={styles.camera} facing="back" /> : <View style={styles.center}><Text style={styles.text}>{error ?? clockError ?? (siteReady && galleryApproval ? "Admin-approved import. Original EXIF time and GPS are required." : t("checkingGps"))}</Text><Pressable onPress={onDone}><Text style={styles.ghostText}>{t("back")}</Text></Pressable></View>}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {saved ? <Text style={styles.message}>{saved}</Text> : null}

      <View style={styles.footer}>
        <Pressable onPress={onDone} style={styles.ghost} accessibilityRole="button">
          <Text style={styles.ghostText}>{t("done")}</Text>
        </Pressable>
        <Pressable
          onPress={captureGroupPhoto}
          disabled={busy || !siteReady}
          style={[styles.primary, busy && styles.disabled]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>{busy ? t("saving") : galleryApproval ? t("gallery") : t("capture")}</Text>
        </Pressable>
      </View>

      {stamp ? (
        <View style={styles.offscreen} pointerEvents="none">
          <StampedPhoto
            ref={stampRef}
            uri={stamp.uri}
            aspectRatio={stamp.aspectRatio}
            width={width}
            lines={stamp.lines}
            onImageLoaded={() => imageReadyRef.current?.()}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingTop: 56 },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: 24, gap: 16 },
  header: { paddingHorizontal: 20, gap: 4, marginBottom: 12 },
  heading: { color: colors.foreground, fontFamily: fonts.bold, fontSize: 18 },
  muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  text: { color: colors.foreground, fontFamily: fonts.regular, fontSize: 16, textAlign: "center" },
  camera: { flex: 1, marginHorizontal: 12, borderRadius: 12, overflow: "hidden" },
  error: { color: colors.danger, fontFamily: fonts.medium, paddingHorizontal: 20, marginTop: 10 },
  message: { color: colors.action, fontFamily: fonts.medium, paddingHorizontal: 20, marginTop: 10 },
  footer: { flexDirection: "row", gap: 12, padding: 20 },
  primary: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: colors.action,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryText: { color: colors.actionInk, fontFamily: fonts.bold, fontSize: 16 },
  ghost: {
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderColor: colors.border,
    borderWidth: 1,
    justifyContent: "center",
  },
  ghostText: { color: colors.action, fontFamily: fonts.medium, fontSize: 16 },
  disabled: { opacity: 0.5 },
  offscreen: { position: "absolute", left: 0, top: 0, opacity: 0 },
});
