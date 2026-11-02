import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { evidenceUrl, getOrder, grantGallery, orderRecords, reviewOrder, reviewPhoto, reviewResult, retryAnalysis, revokeGallery, type Evidence, type Order } from "../api";
import { groupsFor } from "../domain";
import { colors, fonts } from "../theme";

type Records = Awaited<ReturnType<typeof orderRecords>>;
export function ReviewScreen({ order: initial, role, onBack }: { order: Order; role: string; onBack: () => void }) {
  const [order, setOrder] = useState(initial), [records, setRecords] = useState<Records | null>(null);
  const [note, setNote] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [groupId, setGroupId] = useState(groupsFor(initial.site_type)[0]?.id ?? "");
  const [urls, setUrls] = useState<Record<string, string>>({});
  async function refresh() { setOrder(await getOrder(initial.id)); setRecords(await orderRecords(initial.id)); }
  useEffect(() => { refresh().catch(e => setMessage(e.message)); }, [initial.id]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setMessage("");
    try { await action(); await refresh(); setMessage("Saved."); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  const action = (label: string, cb: () => Promise<unknown>) => <Pressable key={label} disabled={busy} onPress={() => { void run(cb); }} accessibilityRole="button" style={styles.button}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  async function show(e: Evidence) { setUrls(prev => ({ ...prev, [e.id]: "" })); const url = await evidenceUrl(e); setUrls(prev => ({ ...prev, [e.id]: url })); }
  return <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 80, gap: 12 }}>
    <Pressable accessibilityRole="button" onPress={onBack}><Text style={styles.buttonText}>← Back</Text></Pressable>
    <Text style={styles.title}>{order.site_id} · PMR review</Text>
    <Text style={styles.text}>{order.wo} · {order.team} · {order.status}</Text>
    <Text style={styles.text}>Review level: {role.replaceAll("_", " ")}</Text>
    <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Review note / return reason" placeholderTextColor={colors.muted} multiline maxLength={2000} accessibilityLabel="Review note" />
    {message ? <Text style={styles.notice} accessibilityLiveRegion="polite">{message}</Text> : null}
    {action("Refresh", refresh)}
    <Text style={styles.title}>Photos</Text>
    {records?.evidence.filter(e => e.state !== "Superseded").map(e => <View key={e.id} style={styles.card}>
      <Text style={styles.heading}>{e.group_id} · {e.state}</Text>
      <Text style={styles.text}>Quality: {e.quality?.score == null ? "Pending analysis" : `${e.quality.score}%`}</Text>
      {e.findings?.map((f, i) => <Text key={i} style={styles.text}>{f.code}: {f.message}</Text>)}
      {records.reviews.filter(v => v.target_id === e.id).map(v => <Text key={v.stage} style={styles.text}>{v.stage}: {v.decision} · {v.note}</Text>)}
      {urls[e.id] ? <Image accessibilityLabel={`Evidence for ${e.group_id}`} source={{ uri: urls[e.id] }} style={{ height: 260, width: "100%" }} resizeMode="contain" /> : null}
      {e.state === "Pending analysis" ? action(`Retry analysis ${e.id.slice(0,6)}`, () => retryAnalysis(e)) : null}
      {action(`View photo ${e.id.slice(0, 6)}`, () => show(e))}
      {action(`Approve photo ${e.id.slice(0, 6)}`, () => reviewPhoto(e, "approved", note))}
      {action(`Return photo ${e.id.slice(0, 6)}`, () => reviewPhoto(e, "returned", note))}
    </View>)}
    <Text style={styles.title}>Individual ETLs</Text>
    {records?.results.map(r => <View key={r.id} style={styles.card}>
      <Text style={styles.heading}>{r.etl_code} · {r.status}</Text>
      <Text style={styles.text}>Readings: {r.readings || "—"} · TT: {r.tt || "—"}</Text>
      <Text style={styles.text}>{r.remarks}</Text>
      <Text style={styles.text}>NOC: {r.noc || "—"}</Text>
      {records.reviews.filter(v => v.target_id === r.id).map(v => <Text key={v.stage} style={styles.text}>{v.stage}: {v.decision}</Text>)}
      {action(`Approve ETL ${r.etl_code}`, () => reviewResult(r, "approved", note))}
      {action(`Return ETL ${r.etl_code}`, () => reviewResult(r, "returned", note))}
    </View>)}
    {role === "admin" ? <View style={styles.card}>
      <Text style={styles.heading}>Gallery exception</Text>
      <TextInput accessibilityLabel="Approved ETL group" value={groupId} onChangeText={setGroupId} style={styles.input} placeholder="ETL group ID" placeholderTextColor={colors.muted} />
      <Text style={styles.text}>Assigned technician only · selected group · 4 hours · maximum 3 photos</Text>
      {action("Grant gallery exception", () => grantGallery(order, groupId, note))}
      {records?.approvals.filter(a => !a.revoked_at).map(a => <View key={a.id}><Text style={styles.text}>{a.groups.join(", ")} · {a.used}/{a.max_images} used</Text>{action(`Revoke ${a.id.slice(0, 6)}`, () => revokeGallery(a.id))}</View>)}
    </View> : null}
    {action("Approve PMR at my review level", () => reviewOrder(order, "approved", note))}
    {action("Return PMR for correction", () => reviewOrder(order, "returned", note))}
  </ScrollView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 56 },
  title: { color: colors.foreground, fontFamily: fonts.bold, fontSize: 21, marginTop: 10 },
  heading: { color: colors.foreground, fontFamily: fonts.bold, fontSize: 16 },
  text: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14 },
  notice: { color: colors.action, fontFamily: fonts.medium },
  card: { padding: 14, gap: 10, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 12 },
  input: { color: colors.foreground, backgroundColor: colors.secondary, padding: 12, minHeight: 48, borderRadius: 8, borderColor: colors.border, borderWidth: 1 },
  button: { minHeight: 46, justifyContent: "center", padding: 10, borderColor: colors.action, borderWidth: 1, borderRadius: 8 },
  buttonText: { color: colors.action, fontFamily: fonts.medium, fontSize: 15 },
});
