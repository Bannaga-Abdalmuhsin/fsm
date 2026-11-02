import type { Member } from "@shared/access";
import { toMember } from "@shared/records";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getSupabase, supabaseConfigured } from "@/lib/supabase";

export type AuthState =
  | { phase: "loading" }
  | { phase: "signed-out" }
  | { phase: "unprovisioned"; email: string }
  | { phase: "ready"; email: string; member: Member };

type AuthContextValue = {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadState(session: Session | null): Promise<AuthState> {
  const email = session?.user.email;
  if (!session || !email) return { phase: "signed-out" };
  const { data, error } = await getSupabase()
    .from("pmr_members")
    .select("owner_email, org_id, role, regions")
    .eq("owner_email", email)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { phase: "unprovisioned", email };
  return { phase: "ready", email, member: toMember(data) };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ phase: "loading" });

  useEffect(() => {
    if (!supabaseConfigured) {
      setState({ phase: "signed-out" });
      return;
    }
    const supabase = getSupabase();
    let active = true;
    const refresh = (session: Session | null) =>
      loadState(session)
        .then((next) => active && setState(next))
        .catch(() => active && setState({ phase: "signed-out" }));

    supabase.auth.getSession().then(({ data }) => refresh(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void refresh(session);
      },
    );
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await getSupabase().auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const value = useMemo(
    () => ({ state, signIn, signOut, requestPasswordReset, updatePassword }),
    [state, signIn, signOut, requestPasswordReset, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
