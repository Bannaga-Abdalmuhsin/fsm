import { useActionQuery } from "@agent-native/core/client/hooks";
import { useState } from "react";

import { AccessMessage, PmrHeader } from "@/components/pmr/PmrHeader";
import { WorkOrderDetail } from "@/components/pmr/WorkOrderDetail";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Work orders · ${APP_TITLE}` }];
}

export default function WorkOrdersRoute() {
  const staff = useActionQuery("get-current-staff");
  const orders = useActionQuery("list-work-orders");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (staff.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!staff.data) {
    return (
      <AccessMessage
        title="No role assigned"
        body="Ask an administrator to assign a role to this account."
      />
    );
  }

  const canCapture = staff.data.role === "technician" || staff.data.role === "admin";
  const activeId = selectedId ?? orders.data?.[0]?.id ?? null;

  return (
    <div className="min-h-full bg-background">
      <PmrHeader staff={staff.data} />
      <div className="mx-auto grid max-w-7xl gap-6 p-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-2">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Assigned work orders
          </h2>
          {orders.data?.length === 0 && (
            <p className="px-1 text-sm text-muted-foreground">No work orders assigned to you.</p>
          )}
          {orders.data?.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => setSelectedId(order.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                activeId === order.id
                  ? "border-primary bg-accent"
                  : "bg-card hover:bg-accent/60"
              }`}
            >
              <p className="font-mono text-xs text-muted-foreground">{order.reference}</p>
              <p className="text-sm font-medium">{order.siteName}</p>
              <p className="mt-1 text-xs capitalize text-muted-foreground">
                {order.status.replace(/_/g, " ")}
              </p>
            </button>
          ))}
        </aside>
        <main className="min-w-0">
          {activeId ? (
            <WorkOrderDetail key={activeId} id={activeId} canCapture={canCapture} />
          ) : (
            <p className="text-sm text-muted-foreground">Select a work order to begin.</p>
          )}
        </main>
      </div>
    </div>
  );
}
