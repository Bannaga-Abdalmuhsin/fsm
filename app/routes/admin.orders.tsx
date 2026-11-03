import { canAssignOrder, canSchedule, type Member } from "@shared/access";
import { localToIso } from "@shared/pmr";
import { newOrderSchema } from "@shared/records";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";

import { Card, Notice, Page, RequireMember } from "@/components/pmr/pmr-shell";
import { Button } from "@/components/ui/button";
import { assignOrder, createOrder, fetchOrders } from "@/lib/pmr-api";

export default function AdminOrdersRoute() {
  return <RequireMember render={(member) => <AdminOrders member={member} />} />;
}

function AdminOrders({ member }: { member: Member }) {
  if (!canSchedule(member)) {
    return (
      <Page title="Not authorized">
        <Card>
          <p className="text-sm">
            Only supervisors and admins can manage work orders.
          </p>
        </Card>
      </Page>
    );
  }
  return (
    <Page title="Create and assign work orders">
      <CreateOrderForm member={member} />
      <AssignOrders member={member} />
    </Page>
  );
}

function CreateOrderForm({ member }: { member: Member }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (form: FormData) => {
      const raw = Object.fromEntries(form.entries());
      const parsed = newOrderSchema.safeParse({
        siteId: raw.siteId,
        siteType: raw.siteType,
        region: raw.region,
        team: raw.team,
        wo: raw.wo,
        tcn: raw.tcn,
        month: raw.month,
        latitude: Number(raw.latitude),
        longitude: Number(raw.longitude),
        scheduledStart: localToIso(String(raw.scheduledStart)),
        scheduledEnd: localToIso(String(raw.scheduledEnd)),
        tcnStart: localToIso(String(raw.tcnStart)),
        tcnEnd: localToIso(String(raw.tcnEnd)),
        assignee: raw.assignee,
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues[0]?.message ?? "Check the form fields.",
        );
      return createOrder(parsed.data, member);
    },
    onSuccess: () => {
      setError(null);
      setDone("Work order created.");
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err) => {
      setDone(null);
      setError((err as Error).message);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(null);
    create.mutate(new FormData(event.currentTarget));
  }

  const field =
    "mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm";

  return (
    <Card>
      <h2 className="mb-3 font-medium">New work order</h2>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          WO
          <input name="wo" required className={field} />
        </label>
        <label className="text-sm">
          TCN
          <input name="tcn" required className={field} />
        </label>
        <label className="text-sm">
          Site ID
          <input name="siteId" required className={field} />
        </label>
        <label className="text-sm">
          Site type
          <select name="siteType" className={field}>
            <option value="ODU">ODU</option>
            <option value="SHELTER">Shelter</option>
          </select>
        </label>
        <label className="text-sm">
          Region
          <select name="region" className={field}>
            {member.regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Team
          <input name="team" required className={field} />
        </label>
        <label className="text-sm">
          Month
          <input name="month" type="month" required className={field} />
        </label>
        <label className="text-sm">
          Assignee email
          <input name="assignee" type="email" required className={field} />
        </label>
        <label className="text-sm">
          Latitude
          <input
            name="latitude"
            type="number"
            step="any"
            required
            className={field}
          />
        </label>
        <label className="text-sm">
          Longitude
          <input
            name="longitude"
            type="number"
            step="any"
            required
            className={field}
          />
        </label>
        <label className="text-sm">
          Scheduled start (Riyadh)
          <input
            name="scheduledStart"
            type="datetime-local"
            required
            className={field}
          />
        </label>
        <label className="text-sm">
          Scheduled end (Riyadh)
          <input
            name="scheduledEnd"
            type="datetime-local"
            required
            className={field}
          />
        </label>
        <label className="text-sm">
          TCN start (Riyadh)
          <input
            name="tcnStart"
            type="datetime-local"
            required
            className={field}
          />
        </label>
        <label className="text-sm">
          TCN end (Riyadh)
          <input
            name="tcnEnd"
            type="datetime-local"
            required
            className={field}
          />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            Create work order
          </Button>
        </div>
      </form>
      {error && (
        <div className="mt-3">
          <Notice>{error}</Notice>
        </div>
      )}
      {done && <p className="mt-3 text-sm">{done}</p>}
    </Card>
  );
}

function AssignOrders({ member }: { member: Member }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", member.ownerEmail],
    queryFn: () => fetchOrders(member),
  });
  const assign = useMutation({
    mutationFn: ({
      orderId,
      assignee,
    }: {
      orderId: string;
      assignee: string;
    }) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new Error("Work order is no longer in scope.");
      return assignOrder(order, assignee.trim(), member);
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err) => setError((err as Error).message),
  });

  return (
    <section className="space-y-3">
      <h2 className="font-medium">Assign in scope</h2>
      {error && <Notice>{error}</Notice>}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {orders.map((order) => (
        <Card key={order.id}>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(event) => {
              event.preventDefault();
              const assignee = String(
                new FormData(event.currentTarget).get("assignee") ?? "",
              );
              assign.mutate({ orderId: order.id, assignee });
            }}
          >
            <div className="min-w-0 flex-1 text-sm">
              <Link
                to={`/orders/${order.id}`}
                className="font-medium underline"
              >
                WO {order.wo}
              </Link>
              <span className="text-muted-foreground">
                {" "}
                · {order.siteId} · {order.status}
              </span>
            </div>
            <input
              name="assignee"
              type="email"
              aria-label={`Assignee for WO ${order.wo}`}
              defaultValue={order.assignee}
              disabled={!canAssignOrder(member, order)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm sm:w-64"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!canAssignOrder(member, order) || assign.isPending}
            >
              Assign
            </Button>
          </form>
        </Card>
      ))}
    </section>
  );
}
