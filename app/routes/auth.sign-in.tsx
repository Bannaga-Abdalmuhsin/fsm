import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";

import { SetupRequired } from "@/components/pmr/pmr-shell";
import { useAuth } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase";

const FONT_STACK = '"Space Grotesk", "Segoe UI", Arial, sans-serif';

const inputClass =
  "mt-2 h-12 w-full rounded-md border border-[#1F4A3A] bg-[#0A1F17] px-3 text-base text-white placeholder:text-[#A9C7BB]/60 focus:border-[#34D399] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#34D399]/60";

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
    <div
      className="flex min-h-full w-full flex-col items-center justify-center bg-[#06140F] px-4 py-10 text-white sm:px-6"
      style={{ fontFamily: FONT_STACK }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"
      />
      <title>PMR Evidence Verification</title>

      <div className="w-full max-w-md">
        <header className="flex flex-col items-center text-center">
          <img
            src="/brand/bm-logo.webp"
            alt="Business Magnificence logo"
            width={800}
            height={800}
            className="h-24 w-24 object-contain sm:h-28 sm:w-28"
          />
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-[#A9C7BB]">
            Business Magnificence
          </p>
          <h1 className="mt-2 bg-[linear-gradient(90deg,#7DD3FC_0%,#5EEAD4_38%,#34D399_70%,#A3E635_100%)] bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
            PMR Evidence Verification
          </h1>
        </header>

        <div className="mt-8 rounded-xl border border-[#0F2A20] bg-[#0B1C15] p-6 shadow-[0_0_60px_-12px_rgba(52,211,153,0.35)] sm:p-8">
          <h2 className="text-xl font-semibold text-white">
            {mode === "signin" ? "Sign in" : "Reset password"}
          </h2>

          <form onSubmit={submit} className="mt-6 space-y-5">
            <label className="block text-sm font-medium text-[#A9C7BB]">
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
              <div className="block text-sm font-medium text-[#A9C7BB]">
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
                    className="absolute inset-y-0 right-0 my-2 mr-2 min-w-[44px] rounded-md px-3 text-sm font-medium text-[#5EEAD4] hover:bg-[#0F2A20] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34D399]/60"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="h-12 w-full rounded-md bg-[#34D399] px-4 text-base font-semibold text-[#041009] transition-colors hover:bg-[#059669] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3E635] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mode === "signin" ? "Sign in" : "Send reset link"}
            </button>
          </form>

          <button
            type="button"
            className="mt-5 min-h-[44px] text-sm font-medium text-[#5EEAD4] underline underline-offset-4 hover:text-[#A3E635] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34D399]/60"
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
              className="mt-5 rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100"
            >
              {error}
            </div>
          )}
          {notice && (
            <p role="status" className="mt-5 text-sm text-[#A9C7BB]">
              {notice}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
