import {
  IconArrowLeft,
  IconCamera,
  IconMapPin,
  IconCloudUpload,
  IconCheck,
  IconFileDownload,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { Camera } from "@/components/pmr/Camera";
import { Shell, Badge } from "@/components/pmr/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useActionQuery, useActionMutation } from "@/lib/pmr-actions";
import { getFix, listDrafts, syncDrafts } from "@/lib/pmr-offline";
import { pmrPhotoUrl } from "@/lib/pmr-photo";

import { formatTime, locationGate, type Geo } from "../../shared/pmr";
export function meta() {
  return [{ title: "PMR visit · FSM Performance Check" }];
}
export default function OrderPage() {
  const { id = "" } = useParams();
  const query = useActionQuery("get-pmr-order", { id });
  const checkin = useActionMutation("check-in-pmr");
  const update = useActionMutation("update-pmr-order");
  const save = useActionMutation("save-pmr-result");
  const review = useActionMutation("review-pmr-evidence");
  const gallery = useActionMutation("manage-pmr-approval");
  const [groupId, setGroup] = useState("");
  const [instance, setInstance] = useState("1");
  const [camera, setCamera] = useState(false);
  const [fix, setFix] = useState<Geo | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState(0);
  const data = query.data;
  const order = data?.order;
  const group =
    order?.checklist.find((g) => g.id === groupId) ?? order?.checklist[0];
  const manager = ["admin", "supervisor"].includes(data?.user.role ?? "");
  const locked = order && ["Submitted", "Approved"].includes(order.status);
  const assigned = data?.user.email === order?.assignee;
  async function refreshDrafts() {
    if (data)
      setDrafts(
        (await listDrafts(data.user.email)).filter(
          (d) => d.metadata.orderId === id,
        ).length,
      );
  }
  useEffect(() => {
    if (data) void refreshDrafts();
  }, [data?.user.email, id]);
  async function perform(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await fn();
      await query.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function locate() {
    await perform("Checking GPS", async () => {
      const next = await getFix();
      setFix(next);
      const gate = locationGate(next, order!, Date.now(), order!.policy);
      if (!gate.allowed) throw new Error(gate.reason!);
      setNotice(
        `Within site boundary · ${gate.distance} m from site · ±${Math.round(next.accuracy)} m accuracy`,
      );
    });
  }
  async function sync() {
    await perform("Syncing evidence", async () => {
      const sent = await syncDrafts(data!.user.email, setBusy);
      setNotice(`${sent} photo(s) synchronized.`);
      await refreshDrafts();
    });
  }
  function exportManifest() {
    if (!data) return;
    const { order, results, evidence, audit } = data;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: "FSM PMR evidence manifest",
            generatedAt: new Date().toISOString(),
            order,
            results,
            evidence,
            audit,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PMR-${order.wo}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!data)
    return (
      <>
        <Skeleton className="h-80 rounded-xl" />
        {query.error && <p className="pmr-error">{query.error.message}</p>}
      </>
    );
  const visible = data.evidence.filter(
    (p) => p.groupId === group?.id && p.instance === instance,
  );
  const approval = data.approvals.find(
    (a) =>
      a.technician === data.user.email &&
      a.groups.includes(group?.id ?? "") &&
      !a.revokedAt &&
      Date.parse(a.expiresAt) > Date.now() &&
      a.used < a.maxImages,
  );
  const completed = data.results.filter(
    (r) => !["Incomplete", "Not tested"].includes(r.status),
  ).length;
  const total = order!.checklist.reduce(
    (n, g) => n + g.etls.length * (order!.inventory[g.id] ?? 1),
    0,
  );
  return (
    <>
      <Link to="/" className="pmr-back">
        <IconArrowLeft size={17} />
        Work orders
      </Link>
      <div className="pmr-page-heading">
        <div>
          <h1>{order!.siteId}</h1>
          <p>
            {order!.wo} · TCN {order!.tcn} · {order!.region} · {order!.siteType}
          </p>
        </div>
        <Badge tone={order!.status === "Approved" ? "green" : "purple"}>
          {order!.status}
        </Badge>
      </div>
      <section className="pmr-visit-bar">
        <div>
          <span>AUTHORIZED TCN WINDOW</span>
          <strong>
            {formatTime(order!.tcnStart)} — {formatTime(order!.tcnEnd)}
          </strong>
        </div>
        <div>
          <span>CHECKLIST COMPLETION</span>
          <strong>
            {completed} / {total} ETLs
          </strong>
          <progress max={total} value={completed} />
        </div>
        <div>
          <span>ASSIGNED TECHNICIAN</span>
          <strong>{order!.assignee}</strong>
        </div>
      </section>
      <div className="pmr-row pmr-wrap pmr-actions">
        {assigned && !locked && (
          <>
            <Button variant="outline" disabled={!!busy} onClick={locate}>
              <IconMapPin size={17} />
              Verify location
            </Button>
            {!order!.checkedInAt && (
              <Button
                disabled={!!busy}
                onClick={() =>
                  void perform("Checking in", async () => {
                    const gps = await getFix();
                    setFix(gps);
                    await checkin.mutateAsync({ id, gps });
                  })
                }
              >
                Check in
              </Button>
            )}
            <Button
              variant="outline"
              disabled={!!busy || !drafts}
              onClick={sync}
            >
              <IconCloudUpload size={17} />
              Sync {drafts ? `(${drafts})` : ""}
            </Button>
          </>
        )}
        <Button variant="outline" onClick={exportManifest}>
          <IconFileDownload size={17} />
          Manifest
        </Button>
        <Link to={`/reports/${id}`} className="pmr-report-link">
          Full PMR report / CSV
        </Link>
      </div>
      {busy && (
        <p className="pmr-notice" role="status">
          {busy}…
        </p>
      )}
      {error && (
        <p className="pmr-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="pmr-success" role="status">
          {notice}
        </p>
      )}
      {order!.reviewNote && (
        <p className="pmr-notice">Review: {order!.reviewNote}</p>
      )}
      <div className="pmr-visit-layout">
        <aside className="pmr-groups">
          <h2>Evidence groups</h2>
          {order!.checklist.map((g) => {
            const count = data.results.filter(
              (r) =>
                g.etls.some((e) => e.code === r.etlCode) &&
                !["Incomplete", "Not tested"].includes(r.status),
            ).length;
            return (
              <button
                key={g.id}
                className={g.id === group?.id ? "active" : ""}
                onClick={() => {
                  setGroup(g.id);
                  setInstance("1");
                }}
              >
                <span>{g.id}</span>
                <div>
                  <strong>{g.title}</strong>
                  <small>
                    {count} / {g.etls.length * (order!.inventory[g.id] ?? 1)}{" "}
                    checks
                  </small>
                </div>
                {count === g.etls.length * (order!.inventory[g.id] ?? 1) && (
                  <IconCheck size={16} />
                )}
              </button>
            );
          })}
        </aside>
        <section className="pmr-group-detail">
          <div className="pmr-row pmr-between pmr-wrap">
            <h2>{group?.title}</h2>
            <div className="pmr-row">
              <select
                aria-label="Equipment instance"
                value={instance}
                onChange={(e) => setInstance(e.target.value)}
              >
                {Array.from(
                  { length: order!.inventory[group?.id ?? ""] ?? 1 },
                  (_, i) => (
                    <option value={i + 1} key={i}>
                      Equipment {i + 1}
                    </option>
                  ),
                )}
              </select>
              {assigned && !locked && (
                <Button
                  disabled={
                    !order!.checkedInAt ||
                    !!busy ||
                    !fix ||
                    !locationGate(fix, order!, Date.now(), order!.policy)
                      .allowed
                  }
                  onClick={() => setCamera(true)}
                >
                  <IconCamera size={18} />
                  Capture
                </Button>
              )}
            </div>
          </div>
          {!order!.checkedInAt && (
            <p className="pmr-hint">
              Verify your location and check in to unlock field evidence.
            </p>
          )}
          <div className="pmr-etl-list">
            {group?.etls.map((etl) => {
              const result = data.results.find(
                (r) => r.etlCode === etl.code && r.instance === instance,
              );
              return (
                <details key={etl.code} className="pmr-etl">
                  <summary>
                    <span className="pmr-etl-number">{etl.number}</span>
                    <span>
                      {etl.description.replace(
                        /^COW_MONTHLY_(?:ONSITE_)?\d+\s*/,
                        "",
                      )}
                    </span>
                    <Badge
                      tone={
                        result?.status === "Pass"
                          ? "green"
                          : result?.status === "Fail"
                            ? "orange"
                            : "neutral"
                      }
                    >
                      {result?.status ?? "Incomplete"}
                    </Badge>
                  </summary>
                  {etl.requiresClarification && (
                    <p className="pmr-error">
                      Original source is truncated. Clarification is required
                      before this check can pass.
                    </p>
                  )}
                  <p className="pmr-hint">{etl.code}</p>
                  <form
                    key={`${etl.code}-${result?.updatedAt ?? ""}`}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void perform("Saving check", async () =>
                        save.mutateAsync({
                          id,
                          gps: await getFix(),
                          etlCode: etl.code,
                          instance,
                          status: String(f.get("status")) as
                            | "Pass"
                            | "Fail"
                            | "Incomplete"
                            | "Not applicable"
                            | "Not tested",
                          remarks: String(f.get("remarks")),
                          readings: String(f.get("readings")),
                          tt: String(f.get("tt")),
                          noc: String(f.get("noc")),
                        }),
                      );
                    }}
                  >
                    <fieldset
                      disabled={
                        !assigned || !!locked || !!busy || !order!.checkedInAt
                      }
                    >
                      <div className="pmr-form-grid">
                        <label>
                          Result
                          <select
                            name="status"
                            defaultValue={result?.status ?? "Incomplete"}
                          >
                            {[
                              "Incomplete",
                              "Pass",
                              "Fail",
                              "Not applicable",
                              "Not tested",
                            ].map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Corrective TT / pending action
                          <Input name="tt" defaultValue={result?.tt} />
                        </label>
                        <label className="pmr-span">
                          Measurements with units
                          <Textarea
                            name="readings"
                            defaultValue={result?.readings}
                            placeholder="Asset / string / cell / phase, reading, unit, instrument and test state"
                          />
                        </label>
                        <label className="pmr-span">
                          NOC / authorized test record
                          <Textarea
                            name="noc"
                            defaultValue={result?.noc}
                            placeholder="Alarm ID, test start/end, authorized procedure/reference, result and restoration"
                          />
                        </label>
                        <label className="pmr-span">
                          Remarks / reason
                          <Textarea
                            name="remarks"
                            defaultValue={result?.remarks}
                          />
                        </label>
                      </div>
                      <Button size="sm">Save check</Button>
                    </fieldset>
                  </form>
                </details>
              );
            })}
          </div>
          <h3 className="pmr-section-title">Photographic evidence</h3>
          {visible.length === 0 ? (
            <div className="pmr-evidence-empty">
              <IconCamera size={28} />
              <p>No evidence for this equipment yet.</p>
              <small>
                A group can use several angles. One photo may support multiple
                visible ETLs.
              </small>
            </div>
          ) : (
            <div className="pmr-photo-grid">
              {visible.map((p) => (
                <article className="pmr-photo" key={p.id}>
                  <a href={pmrPhotoUrl(p.id)} target="_blank" rel="noreferrer">
                    <img
                      src={pmrPhotoUrl(p.id)}
                      loading="lazy"
                      alt={`${group?.title} evidence captured ${formatTime(p.capturedAt)}`}
                    />
                  </a>
                  <div className="pmr-photo-body">
                    <div className="pmr-row pmr-between">
                      <Badge
                        tone={
                          p.state === "Accepted"
                            ? "green"
                            : p.state === "Retake required"
                              ? "orange"
                              : "neutral"
                        }
                      >
                        {p.state}
                      </Badge>
                      <strong>
                        {p.quality.score ?? "—"}%
                        {p.quality.provisional ? "*" : ""}
                      </strong>
                    </div>
                    <p className="pmr-hint">
                      {formatTime(p.capturedAt)}
                      {p.source === "gallery" ? " · Admin-approved import" : ""}
                    </p>
                    {p.quality.provisional && (
                      <p className="pmr-hint">
                        *Provisional quality; analysis incomplete.
                      </p>
                    )}
                    {p.findings.map((f, i) => (
                      <p
                        className={
                          f.severity === "block" ? "pmr-error" : "pmr-notice"
                        }
                        key={i}
                      >
                        {f.message}
                      </p>
                    ))}
                    {Boolean(p.analysis?.error) && (
                      <p className="pmr-hint">{String(p.analysis?.error)}</p>
                    )}
                    <p className="pmr-hint">
                      {p.linkedEtls.length} ETLs linked
                    </p>
                    {p.reviewNote && <p>{p.reviewNote}</p>}
                    {manager && (
                      <details>
                        <summary>Review evidence</summary>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void perform("Saving review", () =>
                              review.mutateAsync({
                                id: p.id,
                                revision: p.revision,
                                decision: String(f.get("decision")) as
                                  | "Accepted"
                                  | "Retake required"
                                  | "Supervisor review",
                                note: String(f.get("note")),
                                linkedEtls: f.getAll("etl").map(String),
                                conditionIssue: String(f.get("conditionIssue")),
                              }),
                            );
                          }}
                        >
                          <label>
                            Decision
                            <select
                              name="decision"
                              defaultValue="Supervisor review"
                            >
                              <option>Supervisor review</option>
                              <option>Accepted</option>
                              <option>Retake required</option>
                            </select>
                          </label>
                          <p className="pmr-hint">
                            Select only ETLs supported by visible details.
                            Acceptance without AI remains manual assessment.
                          </p>
                          <div className="pmr-link-list">
                            {group?.etls.map((e) => (
                              <label key={e.code}>
                                <input
                                  name="etl"
                                  type="checkbox"
                                  value={e.code}
                                  defaultChecked={p.linkedEtls.includes(e.code)}
                                />
                                {e.number} · {e.description.slice(0, 110)}
                              </label>
                            ))}
                          </div>
                          <label>
                            Condition / housekeeping issue
                            <Textarea
                              name="conditionIssue"
                              placeholder="Visible issue keeps this evidence incomplete"
                            />
                          </label>
                          <label>
                            Review note
                            <Textarea name="note" required minLength={5} />
                          </label>
                          <Button disabled={!!busy} size="sm">
                            Save review
                          </Button>
                        </form>
                      </details>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          {data.user.role === "admin" && (
            <details className="pmr-admin-disclosure">
              <summary>Gallery exception for this group</summary>
              <form
                className="pmr-form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void perform("Granting exception", () =>
                    gallery.mutateAsync({
                      id,
                      groups: [group!.id],
                      reason: String(f.get("reason")),
                      expiresAt: new Date(
                        Date.now() + Number(f.get("hours")) * 3600000,
                      ).toISOString(),
                      maxImages: Number(f.get("maxImages")),
                    }),
                  );
                }}
              >
                <label>
                  Reason
                  <Input name="reason" required minLength={5} />
                </label>
                <label>
                  Expires in hours
                  <Input
                    name="hours"
                    type="number"
                    min={1}
                    max={24}
                    defaultValue={2}
                  />
                </label>
                <label>
                  Maximum images
                  <Input
                    name="maxImages"
                    type="number"
                    min={1}
                    max={50}
                    defaultValue={3}
                  />
                </label>
                <Button disabled={!!busy}>Grant scoped approval</Button>
              </form>
            </details>
          )}
        </section>
      </div>
      <section className="pmr-finalize">
        <h2>Visit handover</h2>
        {assigned && !locked && (
          <Button
            disabled={!!busy || !!drafts}
            onClick={() =>
              void perform("Submitting visit", () =>
                update.mutateAsync({
                  id,
                  version: order!.version,
                  status: "Submitted",
                  note: "",
                }),
              )
            }
          >
            Submit for supervisor approval
          </Button>
        )}
        {manager && order!.status === "Submitted" && (
          <form
            className="pmr-row pmr-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void perform("Reviewing visit", () =>
                update.mutateAsync({
                  id,
                  version: order!.version,
                  status: String(f.get("decision")) as "Returned" | "Approved",
                  note: String(f.get("note")),
                }),
              );
            }}
          >
            <select name="decision">
              <option>Returned</option>
              <option>Approved</option>
            </select>
            <Input name="note" required placeholder="Review explanation" />
            <Button disabled={!!busy}>Save decision</Button>
          </form>
        )}
        <p className="pmr-hint">
          Submission checks every applicable ETL, equipment instance and
          accepted evidence link. Not-tested checks block completion.
        </p>
      </section>
      <details className="pmr-audit">
        <summary>Audit trail · latest {data.audit.length} events</summary>
        {data.audit.map((a) => (
          <div key={a.id}>
            <strong>{a.event}</strong>
            <span>
              {formatTime(a.createdAt)} · {a.ownerEmail}
            </span>
            <p>{a.detail}</p>
          </div>
        ))}
      </details>
      {group && (
        <Camera
          open={camera}
          onClose={() => setCamera(false)}
          group={group}
          order={order!}
          instance={instance}
          owner={data.user.email}
          onSaved={() => void refreshDrafts()}
          approval={approval?.id}
        />
      )}
    </>
  );
}
