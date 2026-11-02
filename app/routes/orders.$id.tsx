import { canOperateOrder, type Member } from "@shared/access";
import type { EvidenceGroup } from "@shared/checklists";
import { formatTime } from "@shared/pmr";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router";

import { EvidenceImage } from "@/components/pmr/evidence-image";
import { Card, Notice, Page, RequireMember } from "@/components/pmr/pmr-shell";
import { Button } from "@/components/ui/button";
import { currentFix } from "@/lib/geolocation";
import {
  exportOrderPackage,
  captureEvidence,
  checkInOrder,
  fetchEvidence,
  fetchOrder,
  setOrderStatus,
} from "@/lib/pmr-api";

export default function OrderRoute() {
  return <RequireMember render={(member) => <OrderDetail member={member} />} />;
}

function OrderDetail({ member }: { member: Member }) {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ["order", id, member.ownerEmail],
    queryFn: () => fetchOrder(id, member),
  });
  const evidenceQuery = useQuery({
    queryKey: ["evidence", id],
    queryFn: () => fetchEvidence([id]),
  });

  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => {
      setMessage(null);
      void queryClient.invalidateQueries({ queryKey: ["order", id] });
      void queryClient.invalidateQueries({ queryKey: ["evidence", id] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (orderQuery.error)
    return (
      <Page title="Work order">
        <Notice>{(orderQuery.error as Error).message}</Notice>
      </Page>
    );
  if (!orderQuery.data)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading work order…
      </div>
    );

  const order = orderQuery.data;
  const evidence = evidenceQuery.data ?? [];
  const mine = canOperateOrder(member, order);
  const checkedIn = order.checkIn !== null;
  const canCapture =
    mine &&
    checkedIn &&
    (order.status === "Checked in" || order.status === "In progress");

  function countFor(etlNumber: number) {
    return evidence.filter((e) => e.linkedEtls.includes(etlNumber)).length;
  }

  function onPhoto(
    group: EvidenceGroup,
    etlNumber: number,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const instance = String(countFor(etlNumber) + 1);
    run.mutate(async () => {
      const fix = await currentFix();
      await captureEvidence({
        order,
        member,
        groupId: group.id,
        etlNumber,
        file,
        fix,
        instance,
      });
    });
  }

  return (
    <Page title={`WO ${order.wo}`}>
      <Link to="/" className="text-sm underline">
        Back to work orders
      </Link>
      {member.role !== "technician" ? <Button disabled={run.isPending} onClick={() => run.mutate(() => exportOrderPackage(order.id,order.wo))}>Export WO report & photos</Button> : null}
      <Card>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Site</dt>
          <dd>
            {order.siteId} · {order.siteType}
          </dd>
          <dt className="text-muted-foreground">Region / team</dt>
          <dd>
            {order.region} · {order.team}
          </dd>
          <dt className="text-muted-foreground">Assignee</dt>
          <dd className="break-all">{order.assignee}</dd>
          <dt className="text-muted-foreground">TCN</dt>
          <dd>{order.tcn}</dd>
          <dt className="text-muted-foreground">TCN window</dt>
          <dd>
            {formatTime(order.tcnStart)} – {formatTime(order.tcnEnd)}
          </dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>{order.status}</dd>
          <dt className="text-muted-foreground">Checked in</dt>
          <dd>
            {order.checkedInAt ? formatTime(order.checkedInAt) : "Not yet"}
          </dd>
        </dl>
        {order.reviewNote && (
          <p className="mt-3 text-sm">Review note: {order.reviewNote}</p>
        )}
      </Card>

      {mine && (
        <Card>
          <div className="flex flex-wrap gap-2">
            {!checkedIn && order.status === "Assigned" && (
              <Button
                disabled={run.isPending}
                onClick={() =>
                  run.mutate(async () =>
                    checkInOrder(order, await currentFix(), member),
                  )
                }
              >
                Check in at site
              </Button>
            )}
            {checkedIn && order.status === "Checked in" && (
              <Button
                disabled={run.isPending}
                onClick={() =>
                  run.mutate(() => setOrderStatus(order, "In progress", member))
                }
              >
                Start work
              </Button>
            )}
            {order.status === "In progress" && (
              <Button
                variant="outline"
                disabled={run.isPending}
                onClick={() =>
                  run.mutate(() => setOrderStatus(order, "Submitted", member))
                }
              >
                Submit for review
              </Button>
            )}
          </div>
          {!mine && (
            <p className="text-sm text-muted-foreground">
              Read-only: this work order is not assigned to you.
            </p>
          )}
        </Card>
      )}

      {message && <Notice>{message}</Notice>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">ETL checklist</h2>
        {order.checklist.map((group) => (
          <Card key={group.id}>
            <h3 className="mb-2 font-medium">{group.title}</h3>
            <ul className="divide-y">
              {group.etls.map((etl) => {
                const count = countFor(etl.number);
                return (
                  <li
                    key={etl.number}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">
                        {etl.number}. {etl.code}
                        {etl.requiresClarification && (
                          <span className="ml-2 rounded-full border px-2 py-0.5 text-xs">
                            Needs clarification
                          </span>
                        )}
                      </p>
                      <p className="text-muted-foreground">{etl.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {count} photo{count === 1 ? "" : "s"}
                      </p>
                    </div>
                    {canCapture && (
                      <label className="inline-flex shrink-0 cursor-pointer items-center rounded-md border px-3 py-2 text-sm">
                        Capture photo
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="sr-only"
                          disabled={run.isPending}
                          onChange={(event) =>
                            onPhoto(group, etl.number, event)
                          }
                        />
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </section>

      <section className="space-y-3 pb-8">
        <h2 className="text-lg font-semibold">Evidence</h2>
        {evidence.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No evidence captured yet.
          </p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {evidence.map((item) => (
            <li key={item.id}>
              <Card>
                <div className="flex gap-3">
                  <EvidenceImage evidence={item} />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{item.state}</p>
                    <p className="text-xs text-muted-foreground">
                      Captured {formatTime(item.capturedAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ETL {item.linkedEtls.join(", ")}
                    </p>
                    {item.reviewNote && (
                      <p className="text-xs">Note: {item.reviewNote}</p>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}
