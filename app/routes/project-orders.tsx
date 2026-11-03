import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { Page, RequireMember, Notice } from "@/components/pmr/pmr-shell";
import { Button } from "@/components/ui/button";
import { projectWorkOrders, projectWOPeriods } from "@/lib/office-api";
export default function ProjectOrders() {
  return (
    <RequireMember
      render={(m) => (
        <Catalogue
          national={["admin", "fsm_team"].includes(m.role)}
          regions={m.regions}
        />
      )}
    />
  );
}
function Catalogue({
  national,
  regions,
}: {
  national: boolean;
  regions: string[];
}) {
  const months = useQuery({
    queryKey: ["project-wo-periods"],
    queryFn: projectWOPeriods,
  });
  const [period, setPeriod] = useState(""),
    [region, setRegion] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  const periods = months.data ?? [],
    active = period || periods[0] || "";
  const q = useQuery({
    queryKey: ["project-wos", active],
    queryFn: () => projectWorkOrders(active),
    enabled: !!active,
  });
  const rows = (q.data ?? []).filter(
    (r) =>
      r.period === active &&
      (!region || r.region === region) &&
      [
        r.request_id,
        r.task_id,
        r.site_id,
        r.district,
        r.details.source_technician,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const shown = rows.slice(page * 50, page * 50 + 50);
  return (
    <Page title="Project work orders">
      <div className="office-heading">
        <p>
          {national ? "All regions" : "Regions: " + regions.join(" / ")} ·
          Issued WOs, independent of field scheduling
        </p>
        <Button
          variant="outline"
          disabled={q.isFetching}
          onClick={() => {
            void months.refetch();
            void q.refetch();
          }}
        >
          Refresh
        </Button>
      </div>
      <div className="office-filters">
        <input
          aria-label="Search issued work orders"
          placeholder="Search WO, task, site or district"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Month"
          value={active}
          onChange={(e) => {
            setPeriod(e.target.value);
            setPage(0);
          }}
        >
          {periods.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          aria-label="Region"
          value={region}
          onChange={(e) => {
            setRegion(e.target.value);
            setPage(0);
          }}
        >
          <option value="">{national ? "All regions" : "My regions"}</option>
          {(national ? ["CR", "ER", "WR", "SR"] : regions).map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <p className="office-muted">
        {rows.length} WOs · Request ID is the WO reference; Task ID is shown
        separately. Exported schedule dates are excluded. Actual team scheduling
        and TCN authorization remain with field submissions.
      </p>
      {q.error ? <Notice>{(q.error as Error).message}</Notice> : null}
      <div className="office-table-scroll">
        <table className="office-table">
          <thead>
            <tr>
              <th>WO / Task</th>
              <th>Site / Region</th>
              <th>District / equipment</th>
              <th>Source status / technician</th>
              <th>Submission</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.period + "-" + r.request_id}>
                <td>
                  <strong>{r.request_id}</strong>
                  <small>Task {r.task_id}</small>
                </td>
                <td>
                  {r.site_id}
                  <small>
                    {r.region} ·{" "}
                    {String(r.site_reference.site_type ?? "Type pending CMDB")}
                  </small>
                </td>
                <td>
                  {r.district}
                  <small>
                    {r.details.equipment} · {r.details.service_type}
                  </small>
                </td>
                <td>
                  {r.details.request_status}
                  <small>{r.details.source_technician}</small>
                </td>
                <td>
                  {r.order_id ? (
                    <Link className="office-link" to={`/orders/${r.order_id}`}>
                      Open PMR →
                    </Link>
                  ) : (
                    <span className="office-badge">
                      Awaiting team scheduling
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="office-actions">
        <Button
          variant="outline"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <span>
          {rows.length
            ? `${page * 50 + 1}–${Math.min((page + 1) * 50, rows.length)} of ${rows.length}`
            : "0 WOs"}
        </span>
        <Button
          variant="outline"
          disabled={(page + 1) * 50 >= rows.length}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
      {months.error ? <Notice>{(months.error as Error).message}</Notice> : null}
      {q.isLoading ? <p>Loading issued work orders…</p> : null}
    </Page>
  );
}
