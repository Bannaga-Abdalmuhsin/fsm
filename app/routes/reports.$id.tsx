import { useParams, Link } from "react-router";

import { Badge } from "@/components/pmr/Shell";
import { Button } from "@/components/ui/button";
import { useActionQuery } from "@/lib/pmr-actions";
import { pmrPhotoUrl } from "@/lib/pmr-photo";

import { formatTime } from "../../shared/pmr";
export default function Report() {
  const { id = "" } = useParams();
  const { data, error } = useActionQuery("get-pmr-order", { id });
  if (!data) return <p>{error?.message ?? "Preparing report…"}</p>;
  const { order, results, evidence } = data;
  const safe = (v: unknown) => {
    const s = String(v ?? "");
    return /^[=+@-]/.test(s) ? `'${s}` : s;
  };
  function csv() {
    const rows = [
      [
        "Site",
        "WO",
        "TCN",
        "ETL",
        "Equipment instance",
        "Result",
        "Readings",
        "NOC record",
        "Corrective TT",
        "Remarks",
      ],
      ...order.checklist.flatMap((g) =>
        Array.from({ length: order.inventory[g.id] ?? 1 }, (_, i) =>
          g.etls.map((e) => {
            const r = results.find(
              (x) => x.etlCode === e.code && x.instance === String(i + 1),
            );
            return [
              order.siteId,
              order.wo,
              order.tcn,
              e.code,
              i + 1,
              r?.status ?? "Incomplete",
              r?.readings,
              r?.noc,
              r?.tt,
              r?.remarks,
            ];
          }),
        ).flat(),
      ),
    ];
    const text = rows
      .map((row) =>
        row.map((v) => '"' + safe(v).replace(/"/g, '""') + '"').join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `PMR-${order.wo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <article className="pmr-report">
      <div className="pmr-row pmr-actions">
        <Link to={`/orders/${id}`}>← Return to visit</Link>
        <Button onClick={() => window.print()}>Print / Save PDF</Button>
        <Button variant="outline" onClick={csv}>
          Export ETL CSV
        </Button>
      </div>
      <h1>PMR evidence report</h1>
      <h2>
        {order.siteId} · {order.siteType}
      </h2>
      <p>
        Work order {order.wo} · TCN {order.tcn} · {order.month} · {order.region}
      </p>
      <p>
        Technician: {order.assignee} · Team: {order.team}
      </p>
      <p>
        Scheduled: {formatTime(order.scheduledStart)} —{" "}
        {formatTime(order.scheduledEnd)}
      </p>
      <p>
        Authorized TCN: {formatTime(order.tcnStart)} —{" "}
        {formatTime(order.tcnEnd)}
      </p>
      <p>
        Policy v{order.policy.version} · Visit status: {order.status} ·
        Generated {formatTime(new Date().toISOString())}
      </p>
      {order.checklist.map((g) => (
        <section key={g.id}>
          <h2>
            {g.id} · {g.title}
          </h2>
          {Array.from({ length: order.inventory[g.id] ?? 1 }, (_, i) => (
            <div key={i}>
              <h3>Equipment instance {i + 1}</h3>
              <table>
                <thead>
                  <tr>
                    <th>ETL / requirement</th>
                    <th>Result & record</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {g.etls.map((e) => {
                    const r = results.find(
                      (x) =>
                        x.etlCode === e.code && x.instance === String(i + 1),
                    );
                    const linked = evidence.filter(
                      (p) =>
                        p.instance === String(i + 1) &&
                        p.linkedEtls.includes(e.code),
                    );
                    return (
                      <tr key={e.code}>
                        <td>
                          <code>{e.code}</code>
                          <p>{e.description}</p>
                          {e.requiresClarification && (
                            <Badge tone="orange">
                              Source clarification required
                            </Badge>
                          )}
                        </td>
                        <td>
                          <strong>{r?.status ?? "Incomplete"}</strong>
                          <p>{r?.readings}</p>
                          <p>{r?.noc}</p>
                          <p>{r?.tt}</p>
                          <p>{r?.remarks}</p>
                        </td>
                        <td>
                          {linked.map((p) => (
                            <p key={p.id}>
                              {p.id.slice(0, 8)} · {p.state} ·{" "}
                              {p.quality.score ?? "—"}%{" "}
                              {p.quality.provisional ? "(provisional)" : ""}
                            </p>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="pmr-report-photos">
                {evidence
                  .filter(
                    (p) => p.groupId === g.id && p.instance === String(i + 1),
                  )
                  .map((p) => (
                    <figure key={p.id}>
                      <img src={pmrPhotoUrl(p.id)} alt={`${g.title} ${p.id}`} />
                      <figcaption>
                        {p.id} · {formatTime(p.capturedAt)} · {p.source} ·{" "}
                        {p.state}
                        {p.findings.map((f, i) => (
                          <p key={i}>
                            {f.severity}: {f.message}
                          </p>
                        ))}
                      </figcaption>
                    </figure>
                  ))}
              </div>
            </div>
          ))}
        </section>
      ))}
      <footer>
        Evidence quality and equipment condition are separate. AI findings
        support review and do not establish completion of functional tests. All
        times displayed in Asia/Riyadh.
      </footer>
    </article>
  );
}
