import { useState, type FormEvent } from "react";
import "@/components/pmr/auth-sign-in.css";
import { Navigate } from "react-router";

import { SetupRequired } from "@/components/pmr/pmr-shell";
import { useAuth } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase";

const FONT_STACK = '"Space Grotesk", "Segoe UI", Arial, sans-serif';

const inputClass = "bm-login-input";

export default function LoginRoute() {
  const { state, signIn, requestPasswordReset } = useAuth();
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!supabaseConfigured) return <SetupRequired />;
  if (state.phase === "ready" || state.phase === "unprovisioned")
    return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        await requestPasswordReset(email.trim());
        setNotice("If that account exists, a reset link has been sent to it.");
      }
    } catch (err) {
      setError(
        mode === "signin"
          ? "Sign-in failed. Check your email and password."
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="bm-login" style={{ fontFamily: FONT_STACK }}>
      <title>Sign in | BM FSM PMR</title>
      <div className="bm-login-dots" aria-hidden="true" />
      <div className="bm-login-wave" aria-hidden="true" />
      <header className="bm-login-brand">
        <img
          src="/brand/bm-logo.webp"
          alt="Business Magnificence"
          width={64}
          height={64}
        />
        <div>
          <strong>Business Magnificence</strong>
          <span>FIELD SERVICE MANAGEMENT</span>
        </div>
      </header>
      <div className="bm-login-layout">
        <section className="bm-login-intro" aria-label="PMR office portal">
          <p className="bm-login-eyebrow">
            <span /> STC COW · NATIONAL OPERATIONS
          </p>
          <h1>
            Field evidence.
            <br />
            <em>Complete confidence.</em>
          </h1>
          <p className="bm-login-description">
            One connected workspace to review PMR evidence, approve work orders
            and prepare every submission.
          </p>
          <ol className="bm-login-flow" aria-label="Submission workflow">
            <li>
              <span>01</span>Field capture
            </li>
            <li>
              <span>02</span>Regional review
            </li>
            <li>
              <span>03</span>FSM handover
            </li>
          </ol>
        </section>
        <section className="bm-login-card" aria-label="Account access">
          <div className="bm-login-card-top">
            <span className="bm-login-mark">
              BM<span> / FSM</span>
            </span>
            <span className="bm-login-private">INTERNAL PORTAL</span>
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-[#143a2a]">
            {mode === "signin" ? "Sign in" : "Reset password"}
          </h2>

          <p className="bm-login-card-description">
            {mode === "signin"
              ? "Welcome back. Sign in with your work account."
              : "Enter your work email to request a reset link."}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-5">
            <label className="block text-sm font-medium text-[#53685d]">
              Email
              <input
                id="sign-in-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </label>

            {mode === "signin" && (
              <div className="block text-sm font-medium text-[#53685d]">
                <label htmlFor="sign-in-password">Password</label>
                <div className="relative">
                  <input
                    id="sign-in-password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-24`}
                  />
                  <button
                    type="button"
                    aria-controls="sign-in-password"
                    aria-pressed={showPassword}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-0 my-2 mr-2 min-w-[44px] rounded-md px-3 text-sm font-medium text-[#157448] hover:bg-[#eaf3ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34D399]/60"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            )}

            <button type="submit" disabled={busy} className="bm-login-submit">
              {busy
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in →"
                  : "Send reset link"}
            </button>
          </form>

          <button
            type="button"
            className="mt-5 min-h-[44px] text-sm font-medium text-[#157448] underline underline-offset-4 hover:text-[#0d5031] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34D399]/60"
            onClick={() => {
              setError(null);
              setNotice(null);
              setMode(mode === "signin" ? "reset" : "signin");
            }}
          >
            {mode === "signin" ? "Forgot password?" : "Back to sign in"}
          </button>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-800"
            >
              {error}
            </div>
          )}
          {notice && (
            <p role="status" className="mt-5 text-sm text-[#53685d]">
              {notice}
            </p>
          )}
          <p className="bm-login-access-note">
            Access is managed by your administrator.
          </p>
        </section>
      </div>
      <footer className="bm-login-footer">
        <span>BM FSM PMR</span>
        <span>Engineering excellence. Nationwide reliability.</span>
      </footer>
    </main>
  );
}
