import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "react-router";
import type { Member } from "@shared/access";
import { roleLabel, canSchedule } from "@shared/access";
import { officeStage, stageLabel } from "@shared/office-workflow";
import type { Order } from "@shared/records";
import { Page, RequireMember, Notice } from "./pmr-shell";
import { Button } from "@/components/ui/button";
import { fetchOrders, exportOrderPackage } from "@/lib/pmr-api";
import {
  projectWorkOrders,
  projectWOPeriods,
  fetchHandoffs,
  photoUrl,
  type Photo,
} from "@/lib/office-api";
import { getSupabase } from "@/lib/supabase";

const regionNames: Record<string, string> = {
  CR: "Central",
  ER: "Eastern",
  WR: "Western",
  SR: "Southern",
};
const stages = [
  "Awaiting schedule",
  "Field PMR",
  "Leader review",
  "RM approval",
  "FSM upload",
  "Closed",
];
export default function OperationsPortal() {
  return <RequireMember render={(m) => <Portal member={m} />} />;
}
function Portal({ member: m }: { member: Member }) {
  const path = useLocation().pathname;
  const mode = path.split("/")[1] || "dashboard";
  const [period, setPeriod] = useState(""),
    [region, setRegion] = useState(""),
    [team, setTeam] = useState("");
  const periods = useQuery({
    queryKey: ["project-wo-periods"],
    queryFn: projectWOPeriods,
  });
  const active = period || periods.data?.[0] || "";
  const q = useQuery({
    queryKey: ["portal-operations", m.ownerEmail, active],
    enabled: !!active,
    queryFn: async () => {
      const [issued, orders, handoffs] = await Promise.all([
        projectWorkOrders(active),
        fetchOrders(m),
        fetchHandoffs(),
      ]);
      return {
        issued,
        orders: orders.filter(
          (o) => o.month === active && o.inventory.admin_test !== true,
        ),
        handoffs,
      };
    },
  });
  const all = q.data?.orders ?? [];
  const orders = all.filter(
    (o) => (!region || o.region === region) && (!team || o.team === team),
  );
  const issued = (q.data?.issued ?? []).filter(
    (o) => !region || o.region === region,
  );
  const handoff = (id: string) =>
    q.data?.handoffs.find((h) => h.order_id === id);
  const stage = (o: Order) => officeStage(o.status, handoff(o.id)) + 1;
  const closed = orders.filter((o) => stage(o) === 5).length;
  const linked = new Set(all.map((o) => o.id));
  const waiting = issued.filter(
    (i) => !i.order_id || !linked.has(i.order_id),
  ).length;
  const total =
    issued.length +
    all
      .filter((o) => !region || o.region === region)
      .filter((o) => !issued.some((i) => i.order_id === o.id)).length;
  const years = [...new Set((periods.data ?? []).map((p) => p.slice(0, 4)))];
  const title =
    (
      {
        dashboard: "Monthly PMR dashboard",
        "region-team": "Regional review desk",
        "field-teams": "Field team performance",
        reports: "FSM reports & closure",
        photos: "Photo explorer",
        settings: "Settings",
      } as Record<string, string>
    )[mode] ?? "PMR operations";
  const exportRun = useMutation({
    mutationFn: (o: Order) => exportOrderPackage(o.id, o.wo),
  });
  const scopedRegions = ["admin", "fsm_team"].includes(m.role)
    ? Object.keys(regionNames)
    : m.regions;
  return (
    <Page title={title}>
      <div className="portal-title-row">
        <p className="office-muted">
          {["admin", "fsm_team"].includes(m.role)
            ? "National operations"
            : m.regions.map((r) => regionNames[r] || r).join(" / ")}{" "}
          · {roleLabel(m.role)}
        </p>
        <Button
          variant="outline"
          disabled={q.isFetching}
          onClick={() => {
            void q.refetch();
            void periods.refetch();
          }}
        >
          {q.isFetching ? "Refreshing…" : "Refresh data"}
        </Button>
      </div>
      <div className="portal-period office-filters">
        <label>
          Year
          <select
            aria-label="Year"
            value={active.slice(0, 4)}
            onChange={(e) => {
              setPeriod(
                (periods.data ?? []).find((p) =>
                  p.startsWith(e.target.value),
                ) ?? "",
              );
              setTeam("");
            }}
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          Month
          <select
            aria-label="Month"
            value={active}
            onChange={(e) => {
              setPeriod(e.target.value);
              setTeam("");
            }}
          >
            {(periods.data ?? [])
              .filter((p) => p.startsWith(active.slice(0, 4)))
              .map((p) => (
                <option key={p} value={p}>
                  {new Date(p + "-02T12:00:00Z").toLocaleString("en", {
                    month: "long",
                    timeZone: "UTC",
                  })}
                </option>
              ))}
          </select>
        </label>
        <label>
          Region
          <select
            aria-label="Region"
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setTeam("");
            }}
          >
            <option value="">All accessible regions</option>
            {scopedRegions.map((r) => (
              <option key={r} value={r}>
                {regionNames[r] || r}
              </option>
            ))}
          </select>
        </label>
        <span className="portal-live">
          Supabase records · {active || "No monthly data"}
        </span>
      </div>
      {q.error || periods.error ? (
        <Notice>
          {String(
            (q.error || (periods.error as Error))?.message ??
              "Unable to load operations",
          )}
        </Notice>
      ) : null}
      {q.isLoading || periods.isLoading ? (
        <p className="office-empty">Loading monthly operations…</p>
      ) : !active ? (
        <p className="office-empty">
          No monthly work orders are available in your scope.
        </p>
      ) : null}
      {mode === "settings" ? (
        <section className="office-card">
          <h2>Account & access</h2>
          <div className="office-metadata">
            <div>
              <small>Work account</small>
              <strong>{m.ownerEmail}</strong>
            </div>
            <div>
              <small>Role</small>
              <strong>{roleLabel(m.role)}</strong>
            </div>
            <div>
              <small>Scope</small>
              <strong>
                {scopedRegions.map((r) => regionNames[r]).join(" / ")}
              </strong>
            </div>
          </div>
          {m.role === "admin" ? (
            <Link className="office-link" to="/admin/access">
              Manage people, roles & regions →
            </Link>
          ) : (
            <p className="office-muted">
              Contact your administrator for account or region changes.
            </p>
          )}
          <p className="office-muted">
            Times are shown in Riyadh time. Monthly source dates do not replace
            actual TCN/MDT authorization.
          </p>
        </section>
      ) : null}
      {mode === "dashboard" ? (
        <>
          <div className="portal-kpis">
            {[
              ["Monthly WOs", total, "Issued register + operational WOs"],
              ["Field scheduled", orders.length, "Actual team work orders"],
              [
                "Awaiting review",
                orders.filter((o) => [2, 3].includes(stage(o))).length,
                "Team leader + regional manager",
              ],
              ["Closed in stc", closed, "FSM upload reference recorded"],
            ].map(([label, value, note]) => (
              <div className="portal-kpi" key={label}>
                <span>{label}</span>
                <strong>{q.isLoading ? "—" : value}</strong>
                <small>{note}</small>
              </div>
            ))}
          </div>
          <section className="office-card">
            <div className="portal-title-row">
              <h2>Monthly work-order flow</h2>
              <Link className="office-link" to="/field-submissions">
                Open work orders →
              </Link>
            </div>
            <div className="portal-pipeline">
              {stages.map((s, i) => (
                <Link
                  key={s}
                  to={i === 0 ? "/project-orders" : "/field-submissions"}
                >
                  <small>0{i + 1}</small>
                  <strong>
                    {q.isLoading
                      ? "—"
                      : i === 0
                        ? waiting
                        : orders.filter((o) => stage(o) === i).length}
                  </strong>
                  <span>{s}</span>
                </Link>
              ))}
            </div>
            <p className="office-muted">
              Closed means FSM recorded the actual stc upload reference.
              Regional approval remains a separate stage.
            </p>
          </section>
          <div className="portal-two">
            <section className="office-card">
              <h2>Region performance</h2>
              {scopedRegions
                .filter((r) => !region || r === region)
                .map((r) => {
                  const os = all.filter((o) => o.region === r),
                    n =
                      issued.filter((o) => o.region === r).length +
                      os.filter((o) => !issued.some((i) => i.order_id === o.id))
                        .length,
                    c = os.filter((o) => stage(o) === 5).length;
                  return (
                    <div className="portal-region" key={r}>
                      <div>
                        <strong>{regionNames[r]}</strong>
                        <span>
                          {c} / {n} closed
                        </span>
                      </div>
                      <progress
                        max={n || 1}
                        value={c}
                        aria-label={regionNames[r] + " closure rate"}
                      />
                      <small>
                        {n ? Math.round((c / n) * 100) : 0}% closure ·{" "}
                        {os.length} field WOs
                      </small>
                    </div>
                  );
                })}
            </section>
            <section className="office-card">
              <h2>Next actions</h2>
              <Link className="portal-task" to="/project-orders">
                <strong>{waiting} WOs awaiting team scheduling</strong>
                <span>Assign a field team and confirm authorization →</span>
              </Link>
              <Link className="portal-task" to="/region-team">
                <strong>
                  {orders.filter((o) => [2, 3].includes(stage(o))).length}{" "}
                  submissions awaiting review
                </strong>
                <span>Check evidence and ETL results →</span>
              </Link>
              <Link className="portal-task" to="/reports">
                <strong>
                  {orders.filter((o) => stage(o) === 4).length} WOs ready for
                  FSM
                </strong>
                <span>Export, upload to stc and record closure →</span>
              </Link>
            </section>
          </div>
        </>
      ) : null}
      {mode === "field-teams" ? (
        <>
          <section className="office-card">
            <div className="portal-title-row">
              <h2>Team workload & completion</h2>
              {canSchedule(m) ? (
                <Link className="office-link" to="/admin/orders">
                  Assign work orders →
                </Link>
              ) : null}
            </div>
            <p className="office-muted">
              Counts reflect actual assigned work orders for the selected month.
              Completion means submitted PMR; closure requires FSM confirmation.
            </p>
            <div className="office-table-scroll">
              <table className="office-table">
                <thead>
                  <tr>
                    <th>Team / region</th>
                    <th>Assigned</th>
                    <th>Field pending</th>
                    <th>Submitted or later</th>
                    <th>Closed</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(orders.map((o) => o.region + "|" + o.team))].map(
                    (key) => {
                      const os = orders.filter(
                          (o) => o.region + "|" + o.team === key,
                        ),
                        done = os.filter((o) => stage(o) >= 2).length;
                      return (
                        <tr key={key}>
                          <td>
                            <strong>{os[0].team || "Unassigned team"}</strong>
                            <small>{regionNames[os[0].region]}</small>
                          </td>
                          <td>{os.length}</td>
                          <td>{os.length - done}</td>
                          <td>{done}</td>
                          <td>{os.filter((o) => stage(o) === 5).length}</td>
                          <td>
                            <progress value={done} max={os.length} />
                            <small>
                              {Math.round((done / os.length) * 100)}% submitted
                            </small>
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
            {!orders.length ? (
              <p className="office-empty">
                No field teams have assigned WOs in this selection.
              </p>
            ) : null}
          </section>
          <OrderList
            orders={orders}
            stageLabelFor={(o) => stageLabel(o.status, handoff(o.id))}
          />
        </>
      ) : null}
      {mode === "region-team" ? (
        <>
          <section className="office-card">
            <h2>Review responsibility</h2>
            <p className="office-muted">
              Field submission → team leader evidence and ETL review →
              independent regional manager approval → FSM handover. Open a work
              order to approve or return individual groups and photos.
            </p>
          </section>
          <OrderList
            orders={orders.filter((o) => [2, 3].includes(stage(o)))}
            stageLabelFor={(o) => stageLabel(o.status, handoff(o.id))}
          />
        </>
      ) : null}
      {mode === "reports" ? (
        <>
          <section className="office-card">
            <h2>Export & close</h2>
            <p className="office-muted">
              Download each approved WO as a report and photo package. Upload it
              to the stc system, then open the WO to record the stc reference
              and mark the FSM handover complete.
            </p>
            {exportRun.error ? (
              <Notice>{(exportRun.error as Error).message}</Notice>
            ) : null}
          </section>
          <div className="office-table-scroll">
            <table className="office-table">
              <thead>
                <tr>
                  <th>Work order</th>
                  <th>Region / team</th>
                  <th>Status</th>
                  <th>stc reference</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders
                  .filter((o) => stage(o) >= 4)
                  .map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link className="office-link" to={"/orders/" + o.id}>
                          {o.wo}
                        </Link>
                        <small>{o.siteId}</small>
                      </td>
                      <td>
                        {o.region}
                        <small>{o.team}</small>
                      </td>
                      <td>{stageLabel(o.status, handoff(o.id))}</td>
                      <td>{handoff(o.id)?.stc_reference || "Not recorded"}</td>
                      <td>
                        <div className="office-actions">
                          <Button
                            disabled={exportRun.isPending}
                            onClick={() => exportRun.mutate(o)}
                          >
                            Export report & photos
                          </Button>
                          <Link className="office-link" to={"/orders/" + o.id}>
                            Handover →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!orders.some((o) => stage(o) >= 4) ? (
            <p className="office-empty">
              No region-approved WOs are ready for export in this selection.
            </p>
          ) : null}
        </>
      ) : null}
      {mode === "photos" ? (
        <>
          <div className="office-filters">
            <select
              aria-label="Field team"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            >
              <option value="">All field teams</option>
              {[
                ...new Set(
                  all
                    .filter((o) => !region || o.region === region)
                    .map((o) => o.team),
                ),
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <Photos key={active + region + team} orders={orders} />
        </>
      ) : null}
    </Page>
  );
}
function OrderList({
  orders,
  stageLabelFor,
}: {
  orders: Order[];
  stageLabelFor: (o: Order) => string;
}) {
  return (
    <div className="office-table-scroll">
      <table className="office-table">
        <thead>
          <tr>
            <th>Work order / site</th>
            <th>Region / team</th>
            <th>TCN / MDT window</th>
            <th>Current stage</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <strong>{o.wo}</strong>
                <small>
                  {o.siteId} · {o.siteType}
                </small>
              </td>
              <td>
                {o.region}
                <small>
                  {o.team} · {o.assignee}
                </small>
              </td>
              <td>
                {o.tcn || "Authorization pending"}
                <small>
                  {o.tcnStart
                    ? new Date(o.tcnStart).toLocaleString("en-GB", {
                        timeZone: "Asia/Riyadh",
                      })
                    : "Window pending"}
                </small>
              </td>
              <td>
                <span className="office-badge">{stageLabelFor(o)}</span>
              </td>
              <td>
                <Link className="office-link" to={"/orders/" + o.id}>
                  Open →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!orders.length ? (
        <p className="office-empty">No work orders match this selection.</p>
      ) : null}
    </div>
  );
}
function Photos({ orders }: { orders: Order[] }) {
  const [page, setPage] = useState(0),
    [group, setGroup] = useState("");
  const ids = orders.map((o) => o.id);
  const q = useQuery({
    queryKey: ["portal-photos", ids.join(","), page, group],
    queryFn: async () => {
      if (!ids.length) return [];
      let req = getSupabase()
        .from("pmr_evidence")
        .select("*")
        .in("order_id", ids)
        .neq("state", "Superseded")
        .order("captured_at", { ascending: false })
        .order("id")
        .range(page * 24, page * 24 + 24);
      if (group) req = req.eq("group_id", group);
      const { data, error } = await req;
      if (error) throw error;
      return data as (Photo & { order_id: string })[];
    },
  });
  return (
    <>
      <div className="office-filters">
        <input
          aria-label="ETL group code"
          placeholder="Filter exact ETL group, e.g. S01"
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setPage(0);
          }}
        />
      </div>
      {q.error ? <Notice>{(q.error as Error).message}</Notice> : null}
      {q.isLoading ? <p>Loading photos…</p> : null}
      <div className="portal-photo-grid">
        {q.data?.slice(0, 24).map((p) => (
          <PhotoCard
            key={p.id}
            photo={p}
            order={orders.find((o) => o.id === p.order_id)!}
          />
        ))}
      </div>
      {!q.isLoading && !q.data?.length ? (
        <p className="office-empty">
          No uploaded evidence matches these filters.
        </p>
      ) : null}
      <div className="office-actions">
        <Button
          variant="outline"
          disabled={!page}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <span>Page {page + 1}</span>
        <Button
          variant="outline"
          disabled={(q.data?.length ?? 0) <= 24}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </>
  );
}
function PhotoCard({ photo: p, order: o }: { photo: Photo; order: Order }) {
  const q = useQuery({
    queryKey: ["office-photo", p.id, p.revision],
    queryFn: () => photoUrl(p),
    staleTime: 180000,
  });
  return (
    <article className="portal-photo">
      <Link to={"/orders/" + o.id}>
        {q.data ? (
          <img
            src={q.data}
            alt={`${o.siteId}, ${p.group_id}, WO ${o.wo}`}
            loading="lazy"
          />
        ) : (
          <div className="portal-photo-placeholder">
            {q.error ? "Preview unavailable" : "Loading preview…"}
          </div>
        )}
        <div>
          <strong>
            {o.siteId} · {p.group_id}
          </strong>
          <small>
            WO {o.wo} · {o.region} · {o.team}
          </small>
          <span className="office-badge">{p.state}</span>
          <small>
            {new Date(p.captured_at).toLocaleString("en-GB", {
              timeZone: "Asia/Riyadh",
            })}{" "}
            · Riyadh
          </small>
        </div>
      </Link>
    </article>
  );
}
