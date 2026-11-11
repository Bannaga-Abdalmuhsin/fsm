import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { groupPhotoState, isGroupClosed } from "../groupPhotoState";
import { requiredGroupPhotos } from "../../../shared/checklists";
import { File, Paths } from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import {
  setGeneratorCount,
  checkIn,
  startWork,
  saveEquipmentGroup,
  orderRecords,
  getOrder,
  submitOrder,
  type EtlStatus,
  type Order,
} from "../api";
import {
  queuedEvidence,
  retryEvidence,
  submitGroupEvidence,
  subscribeEvidence,
  type LocalEvidence,
} from "../uploadQueue";
import { getFix, measureClockOffset } from "../evidence";
import { groupsFor, tcnWindowMissing, type EvidenceGroup } from "../domain";
import { colors, fonts } from "../theme";
import { localizedGroupTitle, useLanguage } from "../i18n";
import { baseGroup, checkInEquipmentSection, equipmentCheckLabel, equipmentSections, readingLabels, requiredReadings } from "../equipmentChecks";
const choices = [
  ["Pass", "OK"], ["Fail", "Issue"], ["Not applicable", "N/A"], ["Not tested", "Not checked"],
] as const;
type Draft = {
  checks: Record<string, EtlStatus>;
  generatorState?: string;
  remarks: string;
  values: Record<string, string>;
};
const empty = (): Draft => ({ checks: {}, remarks: "", values: {} });
type Props = {
  order: Order;
  onBack: () => void;
  onCapture: (g: EvidenceGroup) => void;
  onGallery: (g: EvidenceGroup, a: string) => void;
  onOrderChanged: (o: Order) => void;
};
export function OrderScreen({
  order,
  onBack,
  onCapture,
  onGallery,
  onOrderChanged,
}: Props) {
  const { t, rtl, locale } = useLanguage();
  const overview = useRef<ComponentRef<typeof ScrollView>>(null);
  const sectionOffsets = useRef<Record<string, number>>({});
  const returnToSection = useRef<string | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [open, setOpen] = useState<string | null>(null),
    [category, setCategory] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [ready, setReady] = useState(false),
    [records, setRecords] = useState<Awaited<
      ReturnType<typeof orderRecords>
    > | null>(null),
    [uploads, setUploads] = useState<LocalEvidence[]>([]);
  const [generators, setGenerators] = useState(
    String(order.inventory?.generators ?? 1),
  );
  const groups = order.checklist ?? groupsFor(order.site_type),
    draftKey = `pmr-draft-${order.id}`;
  const editable =
    !tcnWindowMissing(order) &&
    ["Checked in", "In progress"].includes(order.status);
  async function refresh() {
    const latestRecords = await orderRecords(order.id);
    const latestUploads = (await queuedEvidence(order.assignee)).filter((u) => u.orderId === order.id);
    setRecords(latestRecords);
    setUploads(latestUploads);
    return { latestRecords, latestUploads };
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      orderRecords(order.id),
      new File(Paths.document, draftKey + ".json").exists
        ? new File(Paths.document, draftKey + ".json").text()
        : Promise.resolve(null),
      queuedEvidence(order.assignee),
    ])
      .then(([r, d, u]) => {
        if (!active) return;
        setRecords(r);
        setUploads(u.filter((v) => v.orderId === order.id));
        const saved: Record<string, Draft> = {};
        for (const g of r.groups)
          saved[g.group_id] = {
            checks: g.field_checks ?? {},
            generatorState: g.generator_state ?? undefined,
            remarks: g.remarks,
            values: Object.fromEntries(
              Object.entries(g.measurements).map(([k, v]) => [k, String(v)]),
            ),
          };
        setDrafts({ ...saved, ...(d ? JSON.parse(d) : {}) });
        setReady(true);
      })
      .catch((e) => setMessage(e.message));
    return () => {
      active = false;
    };
  }, [order.id]);
  useEffect(() => {
    if (ready) {
      try {
        const f = new File(Paths.document, draftKey + ".json");
        f.create({ overwrite: true });
        f.write(JSON.stringify(drafts));
      } catch (e) {
        setMessage((e as Error).message);
      }
    }
  }, [drafts, ready]);
  function patch(id: string, change: Partial<Draft>) {
    setDrafts((p) => ({ ...p, [id]: { ...(p[id] ?? empty()), ...change } }));
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    let current = order;
    if (current.status === "Assigned") {
      await checkIn(
        current,
        await getFix((await measureClockOffset()).offsetMs),
      );
      current = await getOrder(current.id);
      onOrderChanged(current);
    }
    await startWork(current);
    onOrderChanged(await getOrder(current.id));
  }
  async function save(g: EvidenceGroup) {
    const d = drafts[g.id] ?? empty();
    const checks = d.checks ?? {};
    const values: Record<string, number> = {};
    const assessed = Object.values(checks).some((status) => status === "Pass" || status === "Fail");
    if (assessed) {
      for (const key of requiredReadings[baseGroup(g.id)] ?? []) {
        const raw = d.values[key]?.trim();
        const n = Number(raw?.replace(",", "."));
        if (!raw || !Number.isFinite(n)) throw new Error(`Enter ${readingLabels[key]}.`);
        values[key] = n;
      }
    }
    await saveEquipmentGroup(order.id, g.id, checks, d.remarks, values, d.generatorState ?? null,
      records?.groups.find((r) => r.group_id === g.id)?.revision ?? 0);
    returnToSection.current = category;
    setOpen(null);
    setCategory(null);
    setMessage(t("saved"));
    await refresh();
    void submitGroupEvidence(order.assignee, order.id, g.id).then(refresh).catch(e => setMessage(e.message));
  }
  // Refresh on persisted queue transitions, including completion of background uploads.
  useEffect(
    () =>
      subscribeEvidence((email) => {
        if (email.toLowerCase() === order.assignee.toLowerCase())
          void refresh().catch(() => {});
      }),
    [order.id, order.assignee],
  );
  const closedGroups = new Set(groups.filter((group) => isGroupClosed(
    records?.groups.find((result) => result.group_id === group.id)?.status,
    requiredGroupPhotos(group),
    groupPhotoState(group.id, uploads, records?.evidence ?? []),
  )).map((group) => group.id));
  const complete = closedGroups.size;
  useEffect(() => {
    if (open && closedGroups.has(open)) setOpen(null);
  }, [records, uploads]);
  useEffect(() => {
    const section = returnToSection.current;
    if (category !== null || section === null) return;
    const frame = requestAnimationFrame(() => {
      returnToSection.current = null;
      const y = sectionOffsets.current[section];
      if (y !== undefined) overview.current?.scrollTo({ y, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [category]);
  return (
    <ScrollView
      ref={overview}
      style={s.root}
      contentContainerStyle={{
        paddingBottom: 70,
        gap: 14,
        direction: rtl ? "rtl" : "ltr",
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable onPress={onBack} style={s.back} accessibilityRole="button">
        <Text style={s.link}>‹ {t("back")}</Text>
      </Pressable>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>WO {order.wo}</Text>
          <Text style={s.heading}>{order.site_id}</Text>
        </View>
        <Text style={s.chip}>{order.site_type}</Text>
      </View>
      <Text style={s.muted}>
        {order.team} · {order.region} · {order.status}
      </Text>
      <Text style={s.muted}>{order.site_reference?.location}</Text>
      {order.inventory?.admin_test ? (
        <Text style={s.notice}>{t("test")}</Text>
      ) : null}
      <View style={s.card}>
        <Text style={s.title}>
          {t("groups")} · {complete}/{groups.length}
        </Text>
        <View style={s.track}>
          <View
            style={[
              s.progress,
              {
                width: `${groups.length ? (complete / groups.length) * 100 : 0}%`,
              },
            ]}
          />
        </View>
        <Text style={s.muted}>{t("groupHelp")}</Text>
      </View>
      {tcnWindowMissing(order) ? (
        <Text style={s.error}>{t("tcnMissing")}</Text>
      ) : null}
      {order.status === "Assigned" ? (
        <View style={s.card}>
          <Text style={s.muted}>{t("generators")}</Text>
          <TextInput
            accessibilityLabel="Generator count"
            value={generators}
            onChangeText={setGenerators}
            keyboardType="number-pad"
            style={s.input}
          />
          <Button
            label={t("saveEquipment")}
            disabled={busy}
            secondary
            onPress={() =>
              void run(async () => {
                onOrderChanged(
                  await setGeneratorCount(order, Number(generators)),
                );
              })
            }
          />
        </View>
      ) : null}
      {["Assigned", "Checked in"].includes(order.status) ? (
        <Button
          label={t("start")}
          disabled={busy || tcnWindowMissing(order)}
          onPress={() => void run(start)}
        />
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={s.notice}>
          {message}
        </Text>
      ) : null}
      {equipmentSections.map(([name, ids]) => {
        const sectionGroups = groups.filter((group) => ids.split(" ").includes(baseGroup(group.id)) && group.etls.some((check) => checkInEquipmentSection(group.id, check.number, name)));
        if (!sectionGroups.length) return null;
        const expanded = category === name;
        return (
          <View key={name} style={{ gap: 10 }}
            onLayout={({ nativeEvent }) => { sectionOffsets.current[name] = nativeEvent.layout.y; }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
              style={[s.card, s.row]} onPress={() => setCategory(expanded ? null : name)}>
              <Text style={[s.title, { flex: 1 }]}>{name}</Text>
              <Text style={s.muted}>{sectionGroups.filter((group) => closedGroups.has(group.id)).length}/{sectionGroups.length}</Text>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
            </Pressable>
            {expanded && sectionGroups.map((g) => {
        const d = drafts[g.id] ?? empty(),
          saved = records?.groups.find((r) => r.group_id === g.id),
          photos =
            records?.evidence.filter(
              (e) => e.group_id === g.id && e.state !== "Superseded",
            ) ?? [],
          isOpen = open === g.id;
        const photo = groupPhotoState(g.id, uploads, records?.evidence ?? []);
        const closed = closedGroups.has(g.id);
        const minimum = requiredGroupPhotos(g);
        const resultTone =
          saved?.status === "Pass"
            ? { backgroundColor: "#EFFAF2", borderColor: "#159257" }
            : saved?.status === "Fail"
              ? { backgroundColor: "#FFF1F1", borderColor: "#C43C43" }
              : saved?.status === "Not tested"
                ? { backgroundColor: "#FFF8E8", borderColor: "#B77C18" }
                : saved?.status === "Not applicable"
                  ? { backgroundColor: "#F0F2F5", borderColor: "#87929C" }
                  : undefined;
        return (
          <View
            key={g.id}
            style={[s.card, resultTone, saved && { borderLeftWidth: 5 }]}
          >
            <Pressable
              onPress={() => setOpen(isOpen ? null : g.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              style={s.row}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.title}>
                  {localizedGroupTitle(g.title, locale)}
                </Text>
                <Text style={s.muted}>
                  {photo.taken
                    ? `${t("photoTaken")} · ${photo.count} · ${photo.uploaded ? t("photoUploaded") : photo.uploading ? t("uploading") : photo.failed ? t("uploadFailed") : t("submitPhoto")}`
                    : t("noPhoto")}
                </Text>
                <Text style={s.muted}>{t("uploadedPhotos")} · {photo.usableUploaded}/{minimum}</Text>
                <Text style={s.muted}>
                  {t("status")}: {saved ? t(saved.status) : t("pending")} {closed ? "· " + t("groupClosed") : ""}
                </Text>
              </View>
              <Ionicons
                name={isOpen ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.muted}
              />
            </Pressable>
            {isOpen ? (
              <View style={{ gap: 14 }}>
                <Button
                  icon="camera-outline"
                  label={photo.taken && (photo.requiresRetake || photo.retakeRequired) ? t("recapture") : t("capture")}
                  disabled={busy || !editable || !ready}
                  onPress={() => onCapture(g)}
                />
                {photo.taken ? (
                  <View style={{ gap: 8 }}>
                    <Text style={s.notice}>
                      ✓ {t("photoTaken")} ·{" "}
                      {photo.requiresRetake
                        ? t("Retake required")
                        : photo.uploaded
                          ? t("photoUploaded")
                          : photo.failed
                            ? t("uploadFailed")
                            : t("uploadPending")}
                    </Text>
                    {photo.failed && !photo.requiresRetake ? (
                      <Button
                        label={
                          photo.uploading
                            ? t("uploading")
                            : photo.failed
                              ? t("retryPhoto")
                              : t("submitPhoto")
                        }
                        disabled={busy || photo.uploading}
                        onPress={() =>
                          void run(() => save(g))
                        }
                      />
                    ) : null}
                    {photo.failed ? (
                      <Text style={s.error}>
                        {photo.pending.find((e) => e.lastError)?.lastError}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={s.muted}>{t("cameraHelp")}</Text>
                )}
                {photos.map((e) => (
                  <Text
                    key={e.id}
                    style={e.state === "Retake required" ? s.error : s.muted}
                  >
                    {[
                      "Pending analysis",
                      "Retake required",
                      "Supervisor review",
                      "Accepted",
                    ].includes(e.state)
                      ? t(e.state as "Accepted")
                      : e.state}
                    {e.quality?.score != null ? ` · ${e.quality.score}%` : ""}
                  </Text>
                ))}
                {records?.approvals
                  .filter(
                    (a) =>
                      !a.revoked_at &&
                      a.groups.includes(g.id) &&
                      a.used < a.max_images &&
                      Date.parse(a.expires_at) > Date.now(),
                  )
                  .map((a) => (
                    <Button
                      key={a.id}
                      secondary
                      label={t("gallery")}
                      disabled={busy || !editable}
                      onPress={() => onGallery(g, a.id)}
                    />
                  ))}
                {["O09", "S16"].includes(baseGroup(g.id)) && (
                  <View style={{ gap: 6 }}>
                    <Text style={s.label}>Generator operating status</Text>
                    <View style={s.statuses}>
                      {["Running", "Standby", "Fault", "Not checked"].map((state) => (
                        <Pressable key={state} disabled={!editable || busy} accessibilityRole="radio"
                          accessibilityState={{ checked: d.generatorState === state }}
                          style={[s.status, d.generatorState === state && { backgroundColor: colors.action }]}
                          onPress={() => patch(g.id, { generatorState: state })}>
                          <Text style={{ color: d.generatorState === state ? colors.actionInk : colors.foreground }}>{state}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
                {g.etls.filter((check) => checkInEquipmentSection(g.id, check.number, name)).map((check) => (
                  <View key={check.code} style={{ gap: 6 }}>
                    <Text style={s.label}>{equipmentCheckLabel(check.description)}</Text>
                    <View style={s.statuses}>
                      {choices.map(([status, label]) => {
                        const selected = d.checks?.[check.code] === status;
                        return (
                          <Pressable key={status} disabled={!editable || busy}
                            accessibilityRole="radio" accessibilityState={{ checked: selected }}
                            style={[s.status, selected && { backgroundColor: colors.action }]}
                            onPress={() => patch(g.id, { checks: { ...d.checks, [check.code]: status } })}>
                            <Text style={{ color: selected ? colors.actionInk : colors.foreground }}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
                {Object.values(d.checks ?? {}).some((status) => status === "Pass" || status === "Fail") &&
                  (requiredReadings[baseGroup(g.id)] ?? []).map((key) => (
                    <View key={key}>
                      <Text style={s.label}>{readingLabels[key]}</Text>
                      <TextInput editable={editable && !busy} accessibilityLabel={readingLabels[key]}
                        value={d.values[key] ?? ""} inputMode="decimal" maxLength={12} style={s.input}
                        onChangeText={(value) => patch(g.id, { values: { ...d.values, [key]: value } })} />
                    </View>
                  ))}
                <TextInput editable={editable && !busy} accessibilityLabel={t("remarks")}
                  placeholder="Remarks (required for Issue or Not checked)"
                  placeholderTextColor={colors.muted} value={d.remarks}
                  onChangeText={(remarks) => patch(g.id, { remarks })}
                  multiline maxLength={2000} style={[s.input, { minHeight: 72 }]} />
                {g.etls.some((check) => !checkInEquipmentSection(g.id, check.number, name) && !d.checks?.[check.code]) && (
                  <Text style={s.muted}>Complete the related checks in the other equipment section to save these shared photos.</Text>
                )}
                <Button label={t("submitGroup")}
                  disabled={busy || !editable || g.etls.some((check) => !d.checks?.[check.code])}
                  onPress={() => void run(() => save(g))} />
              </View>
            ) : null}
          </View>
        );
      })}
          </View>
        );
      })}
      {order.status === "In progress" && !order.inventory?.admin_test ? (
        <Button
          label={t("submit")}
          disabled={busy || !ready}
          onPress={() =>
            void run(async () => {
              await retryEvidence(order.assignee, undefined, order.id);
              const { latestRecords, latestUploads } = await refresh();
              const readyToSubmit = groups.length > 0 && groups.every((group) => isGroupClosed(
                latestRecords.groups.find((result) => result.group_id === group.id)?.status,
                requiredGroupPhotos(group),
                groupPhotoState(group.id, latestUploads, latestRecords.evidence),
              ));
              if (!readyToSubmit) throw new Error(t("submitIncomplete"));
              await submitOrder(await getOrder(order.id));
              const draft = new File(Paths.document, draftKey + ".json");
              if (draft.exists) draft.delete();
              onOrderChanged(await getOrder(order.id));
            })
          }
        />
      ) : null}
    </ScrollView>
  );
}
function Button({
  label,
  onPress,
  disabled,
  secondary,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  icon?: "camera-outline";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={22} color={colors.actionInk} />
      ) : null}
      <Text style={[s.buttonText, secondary && { color: colors.action }]}>
        {label}
      </Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
    paddingTop: 56,
  },
  back: { minHeight: 44, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  heading: {
    fontSize: 34,
    fontWeight: "700",
    color: colors.foreground,
    letterSpacing: -1,
  },
  eyebrow: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    lineHeight: 23,
  },
  muted: { fontSize: 13, color: colors.muted, lineHeight: 20 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 6,
  },
  link: { color: colors.action, fontSize: 15, fontWeight: "600" },
  chip: {
    backgroundColor: colors.panelRaised,
    color: colors.action,
    borderRadius: 12,
    padding: 10,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 20,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  number: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    height: 5,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  progress: { height: 5, backgroundColor: colors.action },
  button: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.action,
    paddingHorizontal: 18,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  secondary: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: { color: colors.actionInk, fontSize: 15, fontWeight: "600" },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    padding: 13,
    color: colors.foreground,
    fontSize: 16,
    fontFamily: fonts.regular,
  },
  statuses: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  status: {
    paddingHorizontal: 16,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    backgroundColor: colors.secondary,
  },
  selected: { backgroundColor: colors.action, borderColor: colors.action },
  notice: { color: colors.action, lineHeight: 22 },
  error: { color: colors.danger, lineHeight: 22 },
});
