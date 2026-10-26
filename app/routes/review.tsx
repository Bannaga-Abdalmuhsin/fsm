import { useActionQuery } from "@agent-native/core/client/hooks";
import { Link } from "react-router";

import { Shell, Badge, Empty } from "@/components/pmr/Shell";

import { formatTime } from "../../shared/pmr";
export default function Review() {
  const { data, error } = useActionQuery("get-pmr-dashboard", {});
  const orders =
    data?.orders.filter((o) =>
      ["In progress", "Submitted", "Returned"].includes(o.status),
    ) ?? [];
  return (
    <>
      <div className="pmr-page-heading">
        <div>
          <h1>Evidence review</h1>
          <p>Inspect originals, findings and corrective evidence.</p>
        </div>
      </div>
      {error && <p className="pmr-error">{error.message}</p>}
      {!["admin", "supervisor"].includes(data?.user.role ?? "") ? (
        <Empty title="Supervisor access required">
          Only assigned supervisors can review field evidence.
        </Empty>
      ) : orders.length ? (
        <div className="pmr-review-list">
          {orders.map((o) => (
            <Link key={o.id} to={`/orders/${o.id}`}>
              <div>
                <h2>{o.siteId}</h2>
                <span>
                  {o.wo} · {o.region} · {o.assignee}
                </span>
              </div>
              <span>{formatTime(o.scheduledStart)}</span>
              <Badge tone="purple">{o.status}</Badge>
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="No active visits awaiting review">
          Active visits and submitted PMRs in your authorized regions appear
          here.
        </Empty>
      )}
    </>
  );
}
