import { signOut } from "@agent-native/core/client/hooks";
import {
  IconClipboardCheck,
  IconListCheck,
  IconSettings,
  IconLogout,
  IconAntennaBars5,
} from "@tabler/icons-react";
import { NavLink } from "react-router";

import { Button } from "@/components/ui/button";
export function Shell({
  children,
  role,
  email,
}: {
  children: React.ReactNode;
  role?: string;
  email?: string;
}) {
  return (
    <div className="pmr-shell">
      <aside className="pmr-sidebar">
        <NavLink to="/" className="pmr-brand">
          <span className="pmr-brand-icon">
            <IconAntennaBars5 size={26} />
          </span>
          <span>
            FSM<span className="pmr-brand-small">PERFORMANCE CHECK</span>
          </span>
        </NavLink>
        <nav>
          <NavLink to="/" end>
            <IconClipboardCheck size={21} />
            Work orders
          </NavLink>
          <NavLink to="/checklists">
            <IconListCheck size={21} />
            PMR checklists
          </NavLink>
          {["admin", "supervisor"].includes(role ?? "") && (
            <NavLink to="/review">
              <IconClipboardCheck size={21} />
              Evidence review
            </NavLink>
          )}
        </nav>
        <div className="pmr-sidebar-foot">
          <span className="pmr-monogram">
            {(email ?? "F").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{email?.split("@")[0] ?? "Field operations"}</strong>
            <small>{role ?? "Secure workspace"}</small>
          </div>
          <NavLink to="/settings" aria-label="Settings">
            <IconSettings size={18} />
          </NavLink>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Sign out"
            onClick={() => void signOut()}
          >
            <IconLogout size={18} />
          </Button>
        </div>
      </aside>
      <div className="pmr-main">
        <header className="pmr-topbar">
          <span>
            stc COW <span className="pmr-separator">/</span> Field operations
          </span>
          <span className="pmr-secure">
            <span />
            Private workspace
          </span>
        </header>
        <main className="pmr-content">{children}</main>
      </div>
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`pmr-badge ${tone}`}>{children}</span>;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pmr-empty">
      <IconClipboardCheck size={36} />
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
