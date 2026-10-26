import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useState } from "react";

import { AccessMessage, PmrHeader } from "@/components/pmr/PmrHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { APP_TITLE } from "@/lib/app-config";
import {
  DECISION_LABEL,
  DECISION_TONE,
  formatRiyadh,
} from "@/lib/pmr-client";

export function meta() {
  return [{ title: `Review queue · ${APP_TITLE}` }];
}

const CONDITION_CODES = [
  "housekeeping_defect",
  "corrosion",
  "damaged_insulation",
  "missing_label",
  "battery_swelling",
  "blocked_ventilation",
] as const;

export default function ReviewRoute() {
  const staff = useActionQuery("get-current-staff");
  const queue = useActionQuery("list-review-queue");

  if (staff.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!staff.data) {
    return <AccessMessage title="No role assigned" body="Ask an administrator to assign a role to this account." />;
  }
  if (staff.data.role !== "supervisor" && staff.data.role !== "admin") {
    return <AccessMessage title="Supervisors only" body="The review queue is limited to supervisors and administrators." />;
  }

  return (
    <div className="min-h-full bg-background">
      <PmrHeader staff={staff.data} />
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Supervisor review queue</h1>
          <p className="text-sm text-muted-foreground">
            Decisions are documented and audited. Hard gates such as invalid location, unauthorized gallery, confirmed time violations, and historical reuse cannot be accepted here.
          </p>
        </div>
        {queue.isLoading && <p className="text-sm text-muted-foreground">Loading queue…</p>}
        {queue.data?.length === 0 && (
          <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            Nothing awaiting review.
          </p>
        )}
        {queue.data?.map((item) => (
          <ReviewCard key={item.id} item={item} onChanged={() => void queue.refetch()} />
        ))}
      </div>
    </div>
  );
}

type QueueItem = {
  id: string;
  decision: string;
  technicianEmail: string;
  source: string;
  deviceCapturedAt: string;
  uploadedAt: string;
  distanceMeters: number;
  workOrderReference: string;
  taskTitle: string;
  expectedEquipment: string;
  requiredDetails: string;
  findings: { id: string; kind: string; code: string; severity: string; resolvable: boolean; message: string; status: string }[];
};

function ReviewCard({ item, onChanged }: { item: QueueItem; onChanged: () => void }) {
  const resolve = useActionMutation("resolve-evidence");
  const condition = useActionMutation("add-condition-finding");
  const [note, setNote] = useState("");
  const [conditionCode, setConditionCode] = useState<(typeof CONDITION_CODES)[number]>("housekeeping_defect");
  const [conditionMessage, setConditionMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openGates = item.findings.filter((f) => f.kind === "gate" && f.status === "open");
  const hardStop = openGates.some((f) => f.severity === "blocking" && !f.resolvable);

  const act = async (decision: "accept" | "retake") => {
    setError(null);
    try {
      await resolve.mutateAsync({ evidenceId: item.id, decision, note });
      setNote("");
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Decision failed.");
    }
  };

  const recordCondition = async () => {
    setError(null);
    try {
      await condition.mutateAsync({ evidenceId: item.id, code: conditionCode, message: conditionMessage });
      setConditionMessage("");
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record condition.");
    }
  };

  return (
    <article className="space-y-4 rounded-lg border bg-card p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">
            {item.workOrderReference} · {item.taskTitle}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Expected: {item.expectedEquipment}. Required: {item.requiredDetails}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.technicianEmail} · {item.source === "admin_import" ? "Admin-approved import" : "Camera capture"} · captured {formatRiyadh(item.deviceCapturedAt)} · uploaded {formatRiyadh(item.uploadedAt)} · {Math.round(item.distanceMeters)} m from site
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${DECISION_TONE[item.decision]}`}>
          {DECISION_LABEL[item.decision] ?? item.decision}
        </span>
      </header>

      <ul className="space-y-2">
        {openGates.length === 0 && (
          <li className="text-sm text-muted-foreground">
            No open gate findings. Equipment has not been recognised automatically; accepting records a manual equipment confirmation.
          </li>
        )}
        {openGates.map((finding) => (
          <li key={finding.id} className="rounded-md border p-3 text-sm">
            <span className={`mr-2 text-xs font-medium ${finding.resolvable ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-400"}`}>
              {finding.resolvable ? "Resolvable" : "Retake only"}
            </span>
            {finding.message}
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Documented reason (required, at least 10 characters)"
          rows={2}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => act("retake")} disabled={note.trim().length < 10 || resolve.isPending}>
            Request retake
          </Button>
          <Button onClick={() => act("accept")} disabled={hardStop || note.trim().length < 10 || resolve.isPending}>
            Accept with reason
          </Button>
        </div>
      </div>

      <div className="space-y-2 border-t pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Record visible condition</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={conditionCode}
            onChange={(event) => setConditionCode(event.target.value as (typeof CONDITION_CODES)[number])}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {CONDITION_CODES.map((code) => (
              <option key={code} value={code}>
                {code.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <input
            value={conditionMessage}
            onChange={(event) => setConditionMessage(event.target.value)}
            placeholder="What is visible and where in the photograph"
            className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
          />
          <Button
            variant="outline"
            onClick={recordCondition}
            disabled={conditionMessage.trim().length < 10 || condition.isPending}
          >
            Record condition
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </article>
  );
}
