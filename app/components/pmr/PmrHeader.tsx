import { signOut } from "@agent-native/core/client";
import { Link, useLocation } from "react-router";

import { Button } from "@/components/ui/button";

export type StaffSummary = { email: string; name: string; role: string };

const LINKS = [
  { to: "/", label: "Work orders", roles: ["technician", "supervisor", "admin"] },
  { to: "/review", label: "Review queue", roles: ["supervisor", "admin"] },
  { to: "/admin", label: "Admin", roles: ["admin"] },
];

export function PmrHeader({ staff }: { staff: StaffSummary }) {
  const location = useLocation();
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
        <div className="mr-2">
          <p className="text-sm font-semibold tracking-tight">PMR Evidence Control</p>
          <p className="text-xs text-muted-foreground">
            {staff.name} · {staff.role}
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-1">
          {LINKS.filter((link) => link.roles.includes(staff.role)).map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={() => signOut()}>
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}

export function AccessMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border bg-card p-6 text-center">
      <h1 className="text-base font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
