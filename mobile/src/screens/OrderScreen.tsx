import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { setGeneratorCount, checkIn, recordEtlResult, startWork, orderRecords, getOrder, submitOrder, type EtlStatus, type Fix, type Order } from "../api";
import { flushEvidence, queuedEvidence, retryEvidence, type LocalEvidence } from "../uploadQueue";
import { getFix, measureClockOffset } from "../evidence";
import { groupsFor, tcnWindowMissing, type EvidenceGroup, type Etl } from "../domain";
import { colors, fonts } from "../theme";

type Props = {
  order: Order;
  onBack: () => void;
  onCapture: (group: EvidenceGroup) => void;
  onGallery: (group: EvidenceGroup, approval: string) => void;
  onOrderChanged: (order: Order) => void;
};

const statuses: { label: string; value: EtlStatus }[] = [
  { label: "PASS", value: "Pass" },
  { label: "FAIL", value: "Fail" },
  { label: "N/A", value: "Not applicable" },
  { label: "NOT TESTED", value: "Not tested" },
];

export function OrderScreen({ order, onBack, onCapture, onGallery, onOrderChanged }: Props) {
  const [generatorCount, setGeneratorCountInput] = useState(String(order.inventory?.generators ?? 1));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [tt, setTt] = useState<Record<string, string>>({});
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [noc, setNoc] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<LocalEvidence[]>([]);
  const [records, setRecords] = useState<Awaited<ReturnType<typeof orderRecords>> | null>(null);
  const groups = order.checklist ?? groupsFor(order.site_type);
  async function refreshRecords() {
    setUploads((await queuedEvidence(order.assignee)).filter(u => u.orderId === order.id));
    const data = await orderRecords(order.id); setRecords(data);
    for (const r of data.results) {
      const etl = groups.flatMap(g => g.etls).find(e => e.code === r.etl_code);
      if (!etl) continue;
      const key = `${r.instance}-${etl.number}`;
      setTt(p => ({ ...p, [key]: r.tt })); setReadings(p => ({ ...p, [key]: r.readings }));
      setRemarks(p => ({ ...p, [key]: r.remarks })); setNoc(p => ({ ...p, [key]: r.noc }));
    }
  }
  useEffect(() => { refreshRecords().catch(e => setMessage(e.message)); }, [order.id]);
  const tcnMissing = tcnWindowMissing(order);
  const canCapture = !tcnMissing && (order.status === "Checked in" || order.status === "In progress");

  async function run(label: string, action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(`${label} done.`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function doCheckIn() {
    return run("Check-in", async () => {
      const clock = await measureClockOffset();
      const fix: Fix = await getFix(clock.offsetMs);
      await checkIn(order, fix);
      onOrderChanged({ ...order, status: "Checked in", version: order.version + 1 });
    });
  }

  function doStart() {
    return run("Start work", async () => {
      await startWork(order);
      onOrderChanged({ ...order, status: "In progress", version: order.version + 1 });
    });
  }

  function confirmResult(etl: Etl, group: EvidenceGroup, status: EtlStatus) {
    const key = `${group.id}-${etl.number}`;
    const ttValue = tt[key]?.trim() ?? "";
    if (status === "Fail" && !ttValue) {
      setMessage(`ETL ${etl.number}: enter the TT reference before recording FAIL.`);
      return;
    }
    return run(`ETL ${etl.number} ${status}`, () =>
      recordEtlResult({
        orderId: order.id,
        groupId: group.id,
        etlNumber: etl.number,
        etlCode: etl.code,
        status,
        remarks: remarks[key]?.trim() ?? "",
        readings: readings[key]?.trim() ?? "",
        tt: ttValue,
        noc: noc[key]?.trim() ?? "",
      }),
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 48 }}>
      <Pressable onPress={onBack} accessibilityRole="button" style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.heading}>
        {order.site_id} · {order.site_type}
      </Text>
      <Text style={styles.muted}>
        {order.region} · {order.team} · WO {order.wo ?? "pending"} · status {order.status}
      </Text>

      {order.inventory?.admin_test ? <Text style={styles.message}>ADMIN REMOTE TEST — actual GPS recorded; no site-distance restriction. Cannot submit or approve as an operational PMR.</Text> : null}
      {tcnMissing ? (
        <View style={styles.gate}>
          <Text style={styles.gateTitle}>Capture blocked: TCN setup incomplete</Text>
          <Text style={styles.muted}>
            TCN number, start and end must be recorded before check-in, field work or photo capture.
          </Text>
        </View>
      ) : null}

      <Text style={styles.muted}>{order.site_reference?.location ?? "Location reference pending"}</Text>
      <Text style={styles.muted}>{order.site_reference?.site_status ?? ""} · {order.site_reference?.vendor ?? ""} · {order.site_reference?.district ?? ""}</Text>
      {order.status === "Assigned" ? <View style={styles.group}>
        <Text style={styles.muted}>Actual generators on site (1–10)</Text>
        <TextInput accessibilityLabel="Generator count" keyboardType="number-pad" value={generatorCount} onChangeText={setGeneratorCountInput} style={styles.input} />
        <Action label="Save equipment inventory" disabled={busy} onPress={() => { void run("Equipment inventory", async () => { const count = Number(generatorCount); if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("Enter 1 to 10 generators."); onOrderChanged(await setGeneratorCount(order, count)); }); }} />
        <Text style={styles.muted}>Each generator gets its own service, readings, starting battery and alarm photo groups. Save before check-in.</Text>
      </View> : null}
      <View style={styles.actions}>
        {order.status === "Assigned" ? (
          <Action label="Check in (GPS)" onPress={doCheckIn} disabled={busy || tcnMissing} />
        ) : null}
        {order.status === "Checked in" ? <Action label="Start work" onPress={doStart} disabled={busy} /> : null}
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.actions}>
        <Action label="Refresh evidence and results" onPress={() => { void run("Refresh", refreshRecords); }} disabled={busy} />
        <Action label="Retry pending photo uploads" onPress={() => { void run("Upload", async () => { await retryEvidence(order.assignee); await refreshRecords(); }); }} disabled={busy} />
        {uploads.map(u => <Text key={u.evidenceId} style={styles.muted}>{u.groupId}: {u.uploadState}{u.lastError ? ` · ${u.lastError}` : ""}</Text>)}
        {order.status === "In progress" && !order.inventory?.admin_test ? <Action label="Submit PMR for review" onPress={() => { void run("Submit", async () => { await flushEvidence(order.assignee); await submitOrder(order); onOrderChanged(await getOrder(order.id)); }); }} disabled={busy} /> : null}
      </View>
      <Text style={styles.section}>Evidence groups ({groups.length})</Text>
      {groups.map((group) => {
        const open = openGroup === group.id;
        return (
          <View key={group.id} style={styles.group}>
            <Pressable onPress={() => setOpenGroup(open ? null : group.id)} accessibilityRole="button" style={styles.groupHeader}>
              <Text style={styles.groupTitle}>
                {group.id} · {group.title}
              </Text>
              <Text style={styles.muted}>{group.etls.length} ETLs</Text>
            </Pressable>
            {open ? (
              <View style={{ gap: 10 }}>
                <Action
                  label="Capture group photo"
                  onPress={() => onCapture(group)}
                  disabled={busy || !canCapture}
                />
                {records?.approvals.filter(a => !a.revoked_at && a.groups.includes(group.id) && a.used < a.max_images && Date.parse(a.expires_at) > Date.now()).map(a => <Action key={a.id} label="Import photo with admin approval" onPress={() => onGallery(group, a.id)} disabled={busy || !canCapture} />)}
                {group.etls.map((etl) => {
                  const key = `${group.id}-${etl.number}`;
                  return (
                    <View key={key} style={styles.etl}>
                      <Text style={styles.etlTitle}>
                        ETL {etl.number} · {etl.code}
                      </Text>
                      <Text style={styles.muted}>{etl.description}</Text>
                      <TextInput
                        value={readings[key] ?? ""}
                        onChangeText={(v) => setReadings((prev) => ({ ...prev, [key]: v }))}
                        placeholder="Readings (measured values)"
                        placeholderTextColor={colors.muted}
                        style={styles.input}
                        maxLength={500}
                        accessibilityLabel={`Readings for ETL ${etl.number}`}
                      />
                      <TextInput
                        value={remarks[key] ?? ""}
                        onChangeText={(v) => setRemarks((prev) => ({ ...prev, [key]: v }))}
                        placeholder="Remarks"
                        placeholderTextColor={colors.muted}
                        style={styles.input}
                        maxLength={2000}
                        multiline
                        accessibilityLabel={`Remarks for ETL ${etl.number}`}
                      />
                      <TextInput
                        value={tt[key] ?? ""}
                        onChangeText={(v) => setTt((prev) => ({ ...prev, [key]: v }))}
                        placeholder="TT reference (required for FAIL)"
                        placeholderTextColor={colors.muted}
                        style={styles.input}
                        maxLength={200}
                        accessibilityLabel={`TT reference for ETL ${etl.number}`}
                      />
                      <TextInput accessibilityLabel={`NOC alarm reference for ETL ${etl.number}`} value={noc[key] ?? ""} onChangeText={v => setNoc(p => ({ ...p, [key]: v }))} placeholder="NOC alarm ID, test date and time" placeholderTextColor={colors.muted} style={styles.input} maxLength={200} />
                      <Text style={styles.muted}>Saved: {records?.results.find(r => r.etl_code === etl.code && r.instance === group.id)?.status ?? "Incomplete"}</Text>
                      <View style={styles.statusRow}>
                        {statuses.map((s) => (
                          <Pressable
                            key={s.value}
                            onPress={() => confirmResult(etl, group, s.value)}
                            disabled={busy || !canCapture}
                            style={[styles.statusBtn, !canCapture && styles.disabled]}
                            accessibilityRole="button"
                          >
                            <Text style={styles.statusText}>{s.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Action({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.primary, disabled && styles.disabled]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 56 },
  back: { minHeight: 44, justifyContent: "center" },
  backText: { color: colors.action, fontFamily: fonts.medium, fontSize: 15 },
  heading: { color: colors.foreground, fontFamily: fonts.bold, fontSize: 22, marginTop: 8 },
  muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, marginTop: 4 },
  gate: {
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginTop: 14,
  },
  gateTitle: { color: colors.warning, fontFamily: fonts.bold, fontSize: 15 },
  actions: { gap: 10, marginTop: 14 },
  message: { color: colors.action, fontFamily: fonts.medium, marginTop: 12 },
  section: { color: colors.foreground, fontFamily: fonts.bold, fontSize: 18, marginTop: 24, marginBottom: 8 },
  group: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  groupHeader: { minHeight: 48, justifyContent: "center" },
  groupTitle: { color: colors.foreground, fontFamily: fonts.bold, fontSize: 16 },
  etl: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10, gap: 6 },
  etlTitle: { color: colors.foreground, fontFamily: fonts.medium, fontSize: 14 },
  input: {
    minHeight: 48,
    backgroundColor: colors.secondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: colors.foreground,
    fontFamily: fonts.regular,
  },
  statusRow: { flexDirection: "row", gap: 8 },
  statusBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderColor: colors.action,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  statusText: { color: colors.action, fontFamily: fonts.bold },
  primary: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: colors.action,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryText: { color: colors.actionInk, fontFamily: fonts.bold, fontSize: 16 },
  disabled: { opacity: 0.45 },
});
