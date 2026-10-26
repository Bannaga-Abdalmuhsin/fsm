import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DECISION_LABEL,
  DECISION_TONE,
  formatRiyadh,
  getPosition,
  TASK_LABEL,
  TASK_TONE,
} from "@/lib/pmr-client";

import { CaptureDialog, type CaptureTask, type GalleryAccess } from "./CaptureDialog";

type LocationCheck = {
  outcome: "inside" | "outside" | "retry";
  distanceMeters: number;
  accuracyMeters: number;
  reason: string;
  flags: string[];
  checkedIn: boolean;
  checkedInAt: string | null;
};

const OUTCOME_LABEL: Record<LocationCheck["outcome"], string> = {
  inside: "Inside the 250 m geofence",
  outside: "Outside the geofence — capture locked",
  retry: "GPS not reliable — retry",
};

const OUTCOME_TONE: Record<LocationCheck["outcome"], string> = {
  inside: "text-emerald-700 dark:text-emerald-400",
  outside: "text-red-700 dark:text-red-400",
  retry: "text-amber-700 dark:text-amber-300",
};

export function WorkOrderDetail({ id, canCapture }: { id: string; canCapture: boolean }) {
  const query = useActionQuery("get-work-order", { id });
  const locationCheck = useActionMutation("record-location-check");
  const [check, setCheck] = useState<LocationCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [captureTask, setCaptureTask] = useState<CaptureTask | null>(null);

  const runCheck = async (purpose: "open" | "check_in") => {
    setChecking(true);
    setCheckError(null);
    try {
      const fix = await getPosition();
      const result = await locationCheck.mutateAsync({
        workOrderId: id,
        purpose,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy,
        positionTimestamp: fix.timestamp,
        clientSentAt: new Date().toISOString(),
      });
      setCheck(result);
    } catch (caught) {
      setCheck(null);
      setCheckError(caught instanceof Error ? caught.message : "Location check failed.");
    } finally {
      setChecking(false);
      void query.refetch();
    }
  };

  useEffect(() => {
    setCheck(null);
    setCheckError(null);
    if (canCapture) void runCheck("open");
  }, [id, canCapture]);

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading work order…</p>;
  }
  if (query.error || !query.data) {
    return (
      <p className="rounded-md border border-red-500/40 p-3 text-sm">
        {query.error?.message ?? "Work order could not be loaded."}
      </p>
    );
  }

  const { workOrder, tasks, galleryAccess, audit } = query.data;
  const insideFence = check?.outcome === "inside";
  const captureEnabled =
    canCapture && !!workOrder.checkedInAt && insideFence && !checking;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-muted-foreground">{workOrder.reference}</p>
            <h2 className="text-lg font-semibold tracking-tight">{workOrder.siteName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              TCN window: {formatRiyadh(workOrder.tcnStart)} to {formatRiyadh(workOrder.tcnEnd)} (Asia/Riyadh)
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium capitalize">{workOrder.status.replace(/_/g, " ")}</p>
            <p className="text-xs text-muted-foreground">
              {workOrder.checkedInAt
                ? `Checked in ${formatRiyadh(workOrder.checkedInAt)}`
                : "Not checked in"}
            </p>
          </div>
        </div>

        {canCapture && (
          <div className="mt-5 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                {checking && <p className="text-sm text-muted-foreground">Verifying location…</p>}
                {!checking && check && (
                  <>
                    <p className={`text-sm font-medium ${OUTCOME_TONE[check.outcome]}`}>
                      {OUTCOME_LABEL[check.outcome]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {check.reason} GPS ±{check.accuracyMeters} m.
                    </p>
                    {check.flags.map((flag) => (
                      <p key={flag} className="text-xs text-amber-700 dark:text-amber-300">
                        Flagged for supervisor review: {flag}
                      </p>
                    ))}
                  </>
                )}
                {!checking && !check && (
                  <p className="text-sm text-muted-foreground">
                    Location not verified. Capture stays locked until GPS confirms you are within 250 m.
                  </p>
                )}
                {checkError && (
                  <p className="mt-1 text-sm text-red-700 dark:text-red-400">{checkError}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => runCheck("open")} disabled={checking}>
                  Retry GPS
                </Button>
                {!workOrder.checkedInAt && (
                  <Button size="sm" onClick={() => runCheck("check_in")} disabled={checking || !insideFence}>
                    Check in
                  </Button>
                )}
              </div>
            </div>
            {galleryAccess.length > 0 && (
              <GalleryNotice access={galleryAccess} />
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">ETL capture tasks</h3>
        {tasks.map((task) => (
          <article key={task.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-mono text-muted-foreground">
                  {task.etlCode} · {task.evidenceGroup}
                </p>
                <h4 className="font-medium">{task.title}</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Expected: {task.expectedEquipment}. Required: {task.requiredDetails}.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${TASK_TONE[task.status]}`}>
                  {TASK_LABEL[task.status]}
                </span>
                {canCapture && task.status !== "complete" && (
                  <Button
                    size="sm"
                    variant={task.status === "corrective_action_required" ? "default" : "outline"}
                    disabled={!captureEnabled}
                    onClick={() =>
                      setCaptureTask({
                        id: task.id,
                        title: task.title,
                        evidenceGroup: task.evidenceGroup,
                        expectedEquipment: task.expectedEquipment,
                        requiredDetails: task.requiredDetails,
                      })
                    }
                  >
                    {task.status === "corrective_action_required" ? "Capture corrective photo" : "Capture"}
                  </Button>
                )}
              </div>
            </div>

            {task.evidence.length > 0 && (
              <ul className="mt-4 divide-y border-t">
                {task.evidence.map((row) => (
                  <li key={row.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DECISION_TONE[row.decision]}`}>
                        {DECISION_LABEL[row.decision] ?? row.decision}
                      </span>
                      <span className="text-muted-foreground">
                        {row.source === "admin_import" ? "Admin-approved import" : "Camera capture"} · captured{" "}
                        {formatRiyadh(row.deviceCapturedAt)} · uploaded {formatRiyadh(row.uploadedAt)} · {Math.round(row.distanceMeters)} m from site
                      </span>
                    </div>
                    {row.decisionNote && (
                      <p className="text-xs text-muted-foreground">
                        Supervisor ({row.decidedBy}): {row.decisionNote}
                      </p>
                    )}
                    {row.findings
                      .filter((finding) => finding.kind === "gate")
                      .map((finding) => (
                        <p key={finding.id} className="text-sm">
                          {finding.message}
                        </p>
                      ))}
                    {row.findings
                      .filter((finding) => finding.kind === "condition")
                      .map((finding) => (
                        <p key={finding.id} className="text-sm text-red-700 dark:text-red-400">
                          Condition recorded ({finding.code.replace(/_/g, " ")}): {finding.message}
                        </p>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Audit trail</h3>
        <ul className="space-y-1 rounded-lg border bg-card p-3 text-xs">
          {audit.length === 0 && <li className="text-muted-foreground">No events yet.</li>}
          {audit.map((event) => (
            <li key={event.id} className="flex flex-wrap gap-2">
              <span className="font-mono text-muted-foreground">{formatRiyadh(event.createdAt)}</span>
              <span className="font-medium">{event.eventType.replace(/_/g, " ")}</span>
              <span className="text-muted-foreground">{event.actorEmail}</span>
              <span>{event.message}</span>
            </li>
          ))}
        </ul>
      </section>

      <CaptureDialog
        workOrderId={id}
        task={captureTask}
        galleryAccess={galleryAccess as GalleryAccess[]}
        onClose={() => {
          setCaptureTask(null);
          void query.refetch();
        }}
      />
    </div>
  );
}

function GalleryNotice({
  access,
}: {
  access: { evidenceGroups: string[]; expiresAt: string; imagesRemaining: number; reason: string }[];
}) {
  return (
    <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
      {access.map((item) => (
        <p key={item.expiresAt + item.evidenceGroups.join()}>
          Admin approved gallery import for {item.evidenceGroups.join(", ")} ({item.imagesRemaining} image(s) remaining, expires {formatRiyadh(item.expiresAt)}). Reason: {item.reason}
        </p>
      ))}
    </div>
  );
}
