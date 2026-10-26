import {
  IconArrowUpRight,
  IconMapPin,
  IconPlus,
  IconSearch,
  IconCalendar,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router";

import { CreateOrder } from "@/components/pmr/CreateOrder";
import { Shell, Badge, Empty } from "@/components/pmr/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useActionQuery } from "@/lib/pmr-actions";

import { formatTime } from "../../shared/pmr";
export function meta() {
  return [{ title: "Work orders · FSM Performance Check" }];
}
export default function Home() {
  const query = useActionQuery("get-pmr-dashboard", {});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All visits");
  const [create, setCreate] = useState(false);
  const data = query.data;
  const rows = (data?.orders ?? []).filter(
    (o) =>
      `${o.siteId} ${o.wo} ${o.tcn} ${o.team}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "All visits" || o.status === filter),
  );
  return (
    <>
      <div className="pmr-page-heading">
        <div>
          <h1>Every visit. Verified.</h1>
          <p>Site maintenance, supported by trusted evidence.</p>
        </div>
        {["admin", "supervisor"].includes(data?.user.role ?? "") && (
          <Button onClick={() => setCreate(true)}>
            <IconPlus size={18} />
            Schedule PMR
          </Button>
        )}
      </div>
      <section className="pmr-intro">
        <div>
          <Badge tone="purple">PMR EVIDENCE CONTROL</Badge>
          <h2>
            Better evidence.
            <br />
            Fewer repeat visits.
          </h2>
          <p>
            Capture by equipment group. Complete every check.
            <br />
            Keep your work ready for review.
          </p>
          <Link to="/checklists">
            Explore the PMR checklist <IconArrowUpRight size={17} />
          </Link>
        </div>
        <div className="pmr-intro-visual">
          <div className="pmr-visual-ring">
            <IconShieldCheck size={64} stroke={1.3} />
          </div>
          <span>250 m site verification</span>
          <small>Camera capture · Traceable review</small>
        </div>
      </section>
      <div className="pmr-toolbar">
        <div className="pmr-search">
          <IconSearch size={18} />
          <Input
            aria-label="Search work orders"
            placeholder="Search site, WO, TCN or team"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter visit status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {[
            "All visits",
            "Assigned",
            "In progress",
            "Submitted",
            "Returned",
            "Approved",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {query.isLoading ? (
        <div className="pmr-order-grid">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : query.error ? (
        <p className="pmr-error" role="alert">
          {query.error.message}
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </p>
      ) : data?.user.role === "unassigned" ? (
        <Empty title="Your workspace is ready for setup">
          An authorized operator must provision your PMR role before work orders
          are available. Sign-in alone does not grant administration access.
        </Empty>
      ) : rows.length ? (
        <div className="pmr-order-grid">
          {rows.map((o) => (
            <Link className="pmr-order-card" key={o.id} to={`/orders/${o.id}`}>
              <div className="pmr-row pmr-between">
                <span className="pmr-site-icon">
                  <IconMapPin size={22} />
                </span>
                <Badge
                  tone={
                    o.status === "Approved"
                      ? "green"
                      : o.status === "Returned"
                        ? "orange"
                        : "purple"
                  }
                >
                  {o.status}
                </Badge>
              </div>
              <h2>{o.siteId}</h2>
              <span className="pmr-hint">
                {o.siteType === "ODU" ? "Outdoor unit" : "Shelter"} · {o.region}{" "}
                · {o.team}
              </span>
              <dl>
                <div>
                  <dt>WORK ORDER</dt>
                  <dd>{o.wo}</dd>
                </div>
                <div>
                  <dt>TCN</dt>
                  <dd>{o.tcn}</dd>
                </div>
              </dl>
              <div className="pmr-card-foot">
                <span>
                  <IconCalendar size={15} />
                  {formatTime(o.scheduledStart)}
                </span>
                <IconArrowUpRight size={20} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="No visits to show">
          {search
            ? "Try a different site, WO or ticket number."
            : "Scheduled PMR visits will appear here when assigned to your team."}
        </Empty>
      )}
      <CreateOrder open={create} onClose={() => setCreate(false)} />
    </>
  );
}
