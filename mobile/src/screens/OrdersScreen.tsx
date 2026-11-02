import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import type { Order } from "../api";
import { tcnWindowMissing } from "../domain";
import { colors, fonts } from "../theme";

type Props = {
  email: string;
  orders: Order[] | null;
  error: string | null;
  onOpen: (order: Order) => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onAdmin?: () => void;
};

export function OrdersScreen({ email, orders, error, onOpen, onRefresh, onSignOut, onAdmin }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>Assigned work orders</Text>
          <Text style={styles.muted}>{email}</Text>
        </View>
        <Pressable onPress={onSignOut} style={styles.ghost} accessibilityRole="button">
          <Text style={styles.ghostText}>Sign out</Text>
        </Pressable>
      </View>

      {onAdmin ? <Pressable onPress={onAdmin} style={styles.ghost} accessibilityRole="button"><Text style={styles.ghostText}>Scheduling and quality settings</Text></Pressable> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {orders === null && !error ? <ActivityIndicator color={colors.action} style={{ marginTop: 32 }} /> : null}
      {orders !== null && orders.length === 0 ? (
        <Text style={styles.muted}>No work orders are assigned to this account.</Text>
      ) : null}

      <FlatList
        data={orders ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 12, paddingBottom: 32 }}
        onRefresh={onRefresh}
        refreshing={false}
        renderItem={({ item }) => {
          const blocked = tcnWindowMissing(item);
          return (
            <Pressable onPress={() => onOpen(item)} style={styles.card} accessibilityRole="button">
              <Text style={styles.cardTitle}>
                {item.site_id} · {item.site_type}
              </Text>
              <Text style={styles.muted}>
                {item.region} · {item.team} · {item.status}
              </Text>
              <Text style={blocked ? styles.warning : styles.muted}>
                {blocked ? "TCN setup incomplete: capture is blocked" : `TCN ${item.tcn}`}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 56 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  heading: { color: colors.foreground, fontFamily: fonts.bold, fontSize: 22 },
  muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, marginTop: 4 },
  warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 14, marginTop: 6 },
  error: { color: colors.danger, fontFamily: fonts.medium, marginBottom: 12 },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    minHeight: 72,
  },
  cardTitle: { color: colors.foreground, fontFamily: fonts.bold, fontSize: 17 },
  ghost: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
  },
  ghostText: { color: colors.action, fontFamily: fonts.medium },
});
