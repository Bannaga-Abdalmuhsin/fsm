import { canManage, type Member } from "@shared/access";
import { formatTime } from "@shared/pmr";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import { Card, Notice, Page, RequireMember } from "@/components/pmr/pmr-shell";
import { APP_TITLE } from "@/lib/app-config";
import { fetchOrders } from "@/lib/pmr-api";

export function meta() {
  return [
    { title: APP_TITLE },
    { name: "description", content: "Preventive maintenance work orders" },
  ];
}

export default function HomeRoute() {
  return <RequireMember render={(member) => <Dashboard member={member} />} />;
}

function Dashboard({ member }: { member: Member }) {
  const [filter, setFilter] = useState("");
  const { data, error, isLoading } = useQuery({
    queryKey: ["orders", member.ownerEmail],
    queryFn: () => fetchOrders(member),
  });

  const orders = (data ?? []).filter((order) => {
    const q = filter.trim().toLowerCase();
    return (
      !q ||
      [order.wo, order.tcn, order.siteId].some((v) =>
        v.toLowerCase().includes(q),
      )
    );
  });

  return (
    <Page
      title={
        canManage(member)
          ? "Work orders in your regions"
          : "Assigned work orders"
      }
    >
      <input
        aria-label="Search work orders"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Search by WO, TCN or site"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      {error && <Notice>{(error as Error).message}</Notice>}
      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading work orders…</p>
      )}
      {!isLoading && !error && orders.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground">No work orders match.</p>
        </Card>
      )}
      <ul className="space-y-3">
        {orders.map((order) => (
          <li key={order.id}>
            <Link to={`/orders/${order.id}`} className="block">
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      WO {order.wo} · {order.siteId}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {order.siteType} · {order.region} · {order.team}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      TCN {order.tcn}: {formatTime(order.tcnStart)} –{" "}
                      {formatTime(order.tcnEnd)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs">
                    {order.status}
                  </span>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
