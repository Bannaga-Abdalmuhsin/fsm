import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, AppState, StyleSheet, Text, View } from "react-native";
import { useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import type { Session } from "@supabase/supabase-js";

import { listAssignedOrders, loadMembership, signOut, openOrder, getOrder, type Membership, type Order } from "./api";
import type { EvidenceGroup } from "../../shared/checklists";
import { supabase } from "./supabase";
import { supabaseConfigured } from "./config";
import { colors, fonts } from "./theme";
import { getFix, measureClockOffset } from "./evidence";
import { flushEvidence } from "./uploadQueue";
import { AdminScreen } from "./screens/AdminScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { OrdersScreen } from "./screens/OrdersScreen";
import { OrderScreen } from "./screens/OrderScreen";
import { CaptureScreen } from "./screens/CaptureScreen";

type Route =
  | { name: "orders" }
  | { name: "admin" }
  | { name: "order"; order: Order }
  | { name: "capture"; order: Order; group: EvidenceGroup; galleryApproval?: string };

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>({ name: "orders" });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setMembership(null);
      setOrders(null);
      setRoute({ name: "orders" });
      return;
    }
    refresh(session);
  }, [session]);

  useEffect(() => {
    const email = session?.user.email;
    if (!email) return;
    const upload = () => { void flushEvidence(email); };
    upload();
    const timer = setInterval(upload, 15000);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") upload(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [session?.user.id]);

  async function refresh(current: Session) {
    setError(null);
    try {
      const m = await loadMembership();
      setMembership(m);
      if (m.state === "ready") setOrders(await listAssignedOrders(current.user.email ?? "", m.member.role));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!supabaseConfigured) {
    return (
      <Centered>
        <Text style={styles.title}>Setup required</Text>
        <Text style={styles.body}>
          This build has no Supabase URL or publishable key. Set EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY and rebuild.
        </Text>
      </Centered>
    );
  }

  if (!fontsLoaded || session === undefined) {
    return (
      <Centered>
        <ActivityIndicator color={colors.action} />
      </Centered>
    );
  }

  if (!session) {
    return (
      <>
        <StatusBar style="light" />
        <LoginScreen />
      </>
    );
  }

  if (membership && membership.state !== "ready") {
    return (
      <Centered>
        <Text style={styles.title}>Account not ready</Text>
        <Text style={styles.body}>
          {membership.state === "ambiguous"
            ? "This account has more than one PMR organization. An administrator must resolve it."
            : "This account is not provisioned for PMR. Ask an administrator to grant access."}
        </Text>
        <Text style={styles.link} onPress={() => signOut()}>
          Sign out
        </Text>
      </Centered>
    );
  }

  if (!membership || membership.state !== "ready") {
    return (
      <Centered>
        {error ? <Text style={styles.body}>{error}</Text> : <ActivityIndicator color={colors.action} />}
      </Centered>
    );
  }

  const email = membership.member.owner_email;
  const manager = membership.member.role !== "technician";
  async function showOrder(order: Order) {
    setError(null);
    try {
      const full = manager ? await getOrder(order.id) : await openOrder(order.id, await getFix((await measureClockOffset()).offsetMs));
      setRoute({ name: "order", order: full });
    } catch (e) { setError((e as Error).message); }
  }
  const team = route.name === "orders" || route.name === "admin" ? "" : route.order.team;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {route.name === "admin" && membership.member.role === "admin" ? <AdminScreen onBack={() => { setRoute({ name: "orders" }); void refresh(session); }} /> : null}
      {route.name === "orders" ? (
        <OrdersScreen
          email={email}
          orders={orders}
          error={error}
          onOpen={(order) => { void showOrder(order); }}
          onRefresh={() => refresh(session)}
          onSignOut={() => signOut()}
          onAdmin={membership.member.role === "admin" ? () => setRoute({ name: "admin" }) : undefined}
        />
      ) : null}
      {route.name === "order" && manager ? <ReviewScreen order={route.order} role={membership.member.role} onBack={() => { setRoute({ name: "orders" }); void refresh(session); }} /> : null}
      {route.name === "order" && !manager ? (
        <OrderScreen
          order={route.order}
          onBack={() => setRoute({ name: "orders" })}
          onCapture={(group) => setRoute({ name: "capture", order: route.order, group })}
          onGallery={(group, galleryApproval) => setRoute({ name: "capture", order: route.order, group, galleryApproval })}
          onOrderChanged={(updated) => {
            setOrders((prev) => prev?.map((o) => (o.id === updated.id ? updated : o)) ?? null);
            setRoute({ name: "order", order: updated });
          }}
        />
      ) : null}
      {route.name === "capture" ? (
        <CaptureScreen
          order={route.order}
          group={route.group}
          email={email}
          galleryApproval={route.galleryApproval}
          team={team}
          onDone={() => setRoute({ name: "order", order: route.order })}
        />
      ) : null}
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: 24, gap: 14 },
  title: { color: colors.foreground, fontFamily: fonts.bold, fontSize: 22, textAlign: "center" },
  body: { color: colors.muted, fontFamily: fonts.regular, fontSize: 15, textAlign: "center", lineHeight: 22 },
  link: { color: colors.action, fontFamily: fonts.medium, fontSize: 16, padding: 12 },
});
