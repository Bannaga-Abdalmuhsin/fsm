import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useState } from "react";

import { AccessMessage, PmrHeader } from "@/components/pmr/PmrHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { APP_TITLE } from "@/lib/app-config";
import { formatRiyadh } from "@/lib/pmr-client";

export function meta() {
  return [{ title: `Admin · ${APP_TITLE}` }];
}

const ROLE_OPTIONS = ["technician", "supervisor", "admin"] as const;
const GROUP_HINT = "Rectifier, Batteries, MDB, AC, Housekeeping";

export default function AdminRoute() {
  const staff = useActionQuery("get-current-staff");
  const overview = useActionQuery("get-admin-overview");

  if (staff.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!staff.data) {
    return <AccessMessage title="No role assigned" body="Ask an administrator to assign a role to this account." />;
  }
  if (staff.data.role !== "admin") {
    return <AccessMessage title="Administrators only" body="This screen is limited to administrators." />;
  }

  const refresh = () => void overview.refetch();
  const data = overview.data;

  return (
    <div className="min-h-full bg-background">
      <PmrHeader staff={staff.data} />
      <div className="mx-auto max-w-5xl space-y-8 p-4">
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Staff roles</h2>
          <StaffRoles staff={data?.staff ?? []} currentEmail={staff.data.email} onChanged={refresh} />
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Work order assignment</h2>
          <p className="text-sm text-muted-foreground">
            Site coordinates are registered per work order and cannot be changed by technicians.
          </p>
          <div className="space-y-2">
            {data?.workOrders.map((order) => (
              <AssignmentRow
                key={order.id}
                order={order}
                technicians={(data?.staff ?? []).filter((member) => member.role === "technician")}
                onChanged={refresh}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Gallery upload approvals</h2>
          <p className="text-sm text-muted-foreground">
            Approval is scoped to one work order, technician, and evidence groups. Quality, location, time, and duplicate checks still apply.
          </p>
          <GalleryApprovalForm
            workOrders={data?.workOrders ?? []}
            technicians={(data?.staff ?? []).filter((member) => member.role === "technician")}
            onChanged={refresh}
          />
          <ApprovalList approvals={data?.approvals ?? []} />
        </section>
      </div>
    </div>
  );
}

type StaffRow = { email: string; name: string; role: string };

function StaffRoles({ staff, currentEmail, onChanged }: { staff: StaffRow[]; currentEmail: string; onChanged: () => void }) {
  const setRole = useActionMutation("set-staff-role");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRoleValue] = useState<(typeof ROLE_OPTIONS)[number]>("technician");
  const [error, setError] = useState<string | null>(null);

  const save = async (input: { email: string; name: string; role: (typeof ROLE_OPTIONS)[number] }) => {
    setError(null);
    try {
      await setRole.mutateAsync(input);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save role.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-lg border bg-card">
        {staff.map((member) => (
          <div key={member.email} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
            <div>
              <p className="font-medium">{member.name}</p>
              <p className="text-xs text-muted-foreground">{member.email}</p>
            </div>
            <select
              value={member.role}
              disabled={member.email === currentEmail}
              onChange={(event) =>
                save({ email: member.email, name: member.name, role: event.target.value as (typeof ROLE_OPTIONS)[number] })
              }
              className="h-9 rounded-md border bg-background px-3 text-sm disabled:opacity-60"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        ))}
        {staff.length === 0 && <p className="p-3 text-sm text-muted-foreground">No staff yet.</p>}
      </div>
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="h-9 flex-1 rounded-md border bg-background px-3 text-sm" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-9 flex-1 rounded-md border bg-background px-3 text-sm" />
        <select value={role} onChange={(e) => setRoleValue(e.target.value as (typeof ROLE_OPTIONS)[number])} className="h-9 rounded-md border bg-background px-3 text-sm">
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          disabled={!email.trim() || !name.trim() || setRole.isPending}
          onClick={async () => {
            await save({ email: email.trim(), name: name.trim(), role });
            setEmail("");
            setName("");
          }}
        >
          Add or update
        </Button>
      </div>
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

type OrderRow = { id: string; reference: string; siteName: string; technicianEmail: string | null };

function AssignmentRow({ order, technicians, onChanged }: { order: OrderRow; technicians: StaffRow[]; onChanged: () => void }) {
  const assign = useActionMutation("assign-work-order");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{order.reference}</p>
        <p className="font-medium">{order.siteName}</p>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={order.technicianEmail ?? ""}
          onChange={async (event) => {
            setError(null);
            try {
              await assign.mutateAsync({ workOrderId: order.id, technicianEmail: event.target.value || null });
              onChanged();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Could not assign.");
            }
          }}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Unassigned</option>
          {technicians.map((member) => (
            <option key={member.email} value={member.email}>
              {member.name}
            </option>
          ))}
        </select>
        {error && <span className="text-xs text-red-700 dark:text-red-400">{error}</span>}
      </div>
    </div>
  );
}

function GalleryApprovalForm({
  workOrders,
  technicians,
  onChanged,
}: {
  workOrders: OrderRow[];
  technicians: StaffRow[];
  onChanged: () => void;
}) {
  const approve = useActionMutation("create-gallery-approval");
  const [workOrderId, setWorkOrderId] = useState("");
  const [technicianEmail, setTechnicianEmail] = useState("");
  const [groups, setGroups] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxImages, setMaxImages] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setDone(null);
    try {
      await approve.mutateAsync({
        workOrderId,
        technicianEmail,
        evidenceGroups: groups.split(",").map((g) => g.trim()).filter(Boolean),
        reason: reason.trim(),
        expiresAt: new Date(expiresAt).toISOString(),
        maxImages,
      });
      setDone("Approval recorded and audited.");
      setReason("");
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record approval.");
    }
  };

  const ready =
    !!workOrderId && !!technicianEmail && groups.trim().length > 0 && reason.trim().length >= 10 && !!expiresAt;

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
      <select value={workOrderId} onChange={(e) => setWorkOrderId(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
        <option value="">Work order</option>
        {workOrders.map((order) => (
          <option key={order.id} value={order.id}>
            {order.reference} · {order.siteName}
          </option>
        ))}
      </select>
      <select value={technicianEmail} onChange={(e) => setTechnicianEmail(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
        <option value="">Technician</option>
        {technicians.map((member) => (
          <option key={member.email} value={member.email}>
            {member.name}
          </option>
        ))}
      </select>
      <input value={groups} onChange={(e) => setGroups(e.target.value)} placeholder={`Evidence groups: ${GROUP_HINT}`} className="h-9 rounded-md border bg-background px-3 text-sm" />
      <input type="number" min={1} max={20} value={maxImages} onChange={(e) => setMaxImages(Number(e.target.value))} aria-label="Maximum images" className="h-9 rounded-md border bg-background px-3 text-sm" />
      <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} aria-label="Expires at" className="h-9 rounded-md border bg-background px-3 text-sm" />
      <div className="flex items-end justify-end">
        <Button onClick={submit} disabled={!ready || approve.isPending}>
          Approve gallery upload
        </Button>
      </div>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required, at least 10 characters)" rows={2} className="sm:col-span-2" />
      {error && <p className="text-sm text-red-700 dark:text-red-400 sm:col-span-2">{error}</p>}
      {done && <p className="text-sm text-emerald-700 dark:text-emerald-400 sm:col-span-2">{done}</p>}
    </div>
  );
}

type ApprovalRow = {
  id: string;
  workOrderId: string;
  technicianEmail: string;
  evidenceGroups: string;
  reason: string;
  maxImages: number;
  imagesUsed: number;
  expiresAt: string;
  approvedByEmail: string;
};

function ApprovalList({ approvals }: { approvals: ApprovalRow[] }) {
  if (approvals.length === 0) {
    return <p className="text-sm text-muted-foreground">No gallery approvals yet.</p>;
  }
  return (
    <div className="divide-y rounded-lg border bg-card text-sm">
      {approvals.map((approval) => {
        const expired = Date.parse(approval.expiresAt) <= Date.now();
        return (
          <div key={approval.id} className="space-y-1 p-3">
            <p className="font-medium">
              {approval.technicianEmail} · {approval.evidenceGroups.split(",").join(", ")}
            </p>
            <p className="text-xs text-muted-foreground">
              {approval.imagesUsed}/{approval.maxImages} used · {expired ? "expired" : "expires"} {formatRiyadh(approval.expiresAt)} · approved by {approval.approvedByEmail}
            </p>
            <p className="text-xs">{approval.reason}</p>
          </div>
        );
      })}
    </div>
  );
}
