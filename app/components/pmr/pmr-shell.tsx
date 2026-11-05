import "./operations-portal.css";
import { canSchedule, roleLabel, type Member } from "@shared/access";
import { useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase";

export function SetupRequired() {
  return (
    <Page title="Setup required">
      <Card>
        <p className="text-sm">
          Supabase is not connected yet. This app will not show work orders or
          evidence until a publishable key is configured.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Set <code>VITE_SUPABASE_URL</code> to the project URL.
          </li>
          <li>
            Set <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in the secure
            environment settings.
          </li>
          <li>
            Apply <code>supabase/rls.sql</code> after reviewing it.
          </li>
        </ol>
      </Card>
    </Page>
  );
}

export function Page({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="office-page mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground">
      {children}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
    >
      {children}
    </div>
  );
}

export function Shell({
  member,
  children,
}: {
  member: Member;
  children: ReactNode;
}) {
  const { signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="office-shell portal-shell">
      <aside className="portal-sidebar">
        <Link to="/dashboard" className="office-brand">
          <img src="/brand/bm-logo.webp" alt="BM" />
          <span>
            FSM PMR<small>Operations portal</small>
          </span>
        </Link>
        <p className="portal-nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {[
            ["/dashboard", "◫", "Dashboard"],
            ["/project-orders", "▤", "Monthly work orders"],
            ["/field-submissions", "▥", "Field submissions"],
            ["/region-team", "◎", "Region team"],
            ["/field-teams", "◉", "Field team control"],
            ["/photos", "▧", "Photo explorer"],
            ["/reports", "⇩", "FSM reports"],
            ["/settings", "⚙", "Settings"],
          ]
            .filter(
              ([path]) =>
                member.role !== "technician" ||
                ["/field-submissions", "/photos", "/settings"].includes(path),
            )
            .map(([path, icon, label]) => (
              <NavLink key={path} to={path}>
                <span aria-hidden="true">{icon}</span>
                {label}
              </NavLink>
            ))}
          {canSchedule(member) && (
            <NavLink to="/admin/orders">
              <span aria-hidden="true">＋</span>TCN / MDT scheduling
            </NavLink>
          )}
          {member.role === "admin" && (
            <NavLink to="/admin/access">
              <span aria-hidden="true">♙</span>People & access
            </NavLink>
          )}
        </nav>
        <div className="portal-sidebar-footer">
          <strong>BM · stc COW</strong>
          <small>Monthly preventive maintenance</small>
        </div>
      </aside>
      <div className="portal-main">
        <header className="portal-topbar">
          <span>
            {["admin", "fsm_team"].includes(member.role)
              ? "All regions"
              : member.regions.join(" / ")}
            <small>PMR OPERATIONS</small>
          </span>
          <div>
            <span>
              {member.ownerEmail}
              <small>{roleLabel(member.role)}</small>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                signOut().catch(() => setError("Sign out failed. Try again."))
              }
            >
              Sign out
            </Button>
          </div>
        </header>
        {error && <Notice>{error}</Notice>}
        {children}
      </div>
    </div>
  );
}

export function RequireMember({
  render,
}: {
  render: (member: Member) => ReactNode;
}) {
  const { state } = useAuth();
  const location = useLocation();

  if (!supabaseConfigured) return <SetupRequired />;
  if (state.phase === "loading") {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (state.phase === "signed-out") {
    return (
      <Navigate
        to="/auth/sign-in"
        replace
        state={{ from: location.pathname }}
      />
    );
  }
  if (state.phase === "unprovisioned") {
    return (
      <Page title="Account not provisioned">
        <Card>
          <p className="text-sm">
            {state.email} is signed in but has no PMR membership. Ask an admin
            to add you.
          </p>
        </Card>
      </Page>
    );
  }
  return <>{render(state.member)}</>;
}
