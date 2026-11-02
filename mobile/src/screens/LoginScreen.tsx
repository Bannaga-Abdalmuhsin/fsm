import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { requestPasswordReset, signIn } from "../api";
import { colors, fonts } from "../theme";

const logo = require("../../assets/bm-logo.png");

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setNotice("If that account exists, a reset link has been sent to it.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.glow} />
        <Image source={logo} style={styles.logo} accessibilityLabel="Business Magnificence logo" />
        <Text style={styles.brand}>Business Magnificence</Text>
        <Text style={styles.title}>PMR Evidence Verification</Text>

        <View style={styles.panel}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="name@company.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
            accessibilityLabel="Email"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              placeholder="Password"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.passwordInput]}
              accessibilityLabel="Password"
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              style={styles.toggle}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            >
              <Text style={styles.toggleText}>{showPassword ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Pressable
            onPress={submit}
            disabled={busy}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed, busy && styles.disabled]}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={colors.actionInk} />
            ) : (
              <Text style={styles.primaryText}>Sign in</Text>
            )}
          </Pressable>

          <Pressable onPress={forgotPassword} disabled={busy} style={styles.link} accessibilityRole="button">
            <Text style={styles.linkText}>Forgot password?</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  glow: {
    position: "absolute",
    top: 80,
    alignSelf: "center",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(52,211,153,0.12)",
  },
  logo: { width: 120, height: 120, alignSelf: "center" },
  brand: {
    color: colors.muted,
    fontFamily: fonts.medium,
    fontSize: 14,
    textAlign: "center",
    marginTop: 16,
    letterSpacing: 1,
  },
  title: {
    color: colors.foreground,
    fontFamily: fonts.bold,
    fontSize: 26,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 24,
  },
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
  },
  label: { color: colors.muted, fontFamily: fonts.medium, fontSize: 14, marginTop: 12, marginBottom: 6 },
  input: {
    minHeight: 52,
    backgroundColor: colors.secondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    color: colors.foreground,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  passwordInput: { flex: 1 },
  toggle: {
    minHeight: 52,
    minWidth: 72,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    borderColor: colors.border,
    borderWidth: 1,
  },
  toggleText: { color: colors.action, fontFamily: fonts.medium, fontSize: 15 },
  error: { color: colors.danger, fontFamily: fonts.medium, marginTop: 14 },
  notice: { color: colors.action, fontFamily: fonts.medium, marginTop: 14 },
  primary: {
    minHeight: 52,
    marginTop: 20,
    borderRadius: 8,
    backgroundColor: colors.action,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryPressed: { backgroundColor: colors.actionHover },
  primaryText: { color: colors.actionInk, fontFamily: fonts.bold, fontSize: 17 },
  disabled: { opacity: 0.6 },
  link: { minHeight: 48, justifyContent: "center", alignItems: "center", marginTop: 8 },
  linkText: { color: colors.action, fontFamily: fonts.medium, fontSize: 15 },
});
