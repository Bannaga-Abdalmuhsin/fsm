import { canManage, canReviewEvidence, type Member } from "@shared/access";
import { formatTime } from "@shared/pmr";
import type { Evidence, Order } from "@shared/records";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import { EvidenceImage } from "@/components/pmr/evidence-image";
import { Card, Notice, Page, RequireMember } from "@/components/pmr/pmr-shell";
import { Button } from "@/components/ui/button";
import { fetchEvidence, fetchOrders, reviewEvidence } from "@/lib/pmr-api";

const openStates = ["Pending analysis", "Supervisor review"];

export default function ReviewRoute() {
  return <RequireMember render={(member) => <ReviewQueue member={member} />} />;
}

function ReviewQueue({ member }: { member: Member }) {
  if (!canManage(member)) {
    return (
      <Page title="Not authorized">
        <Card>
          <p className="text-sm">
            Only supervisors and admins can review evidence.
          </p>
        </Card>
      </Page>
    );
  }
  return <Queue member={member} />;
}

function Queue({ member }: { member: Member }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["review", member.ownerEmail],
    queryFn: async () => {
      const orders = await fetchOrders(member);
      const evidence = await fetchEvidence(orders.map((o) => o.id));
      return {
        orders,
        evidence: evidence.filter((e) => openStates.includes(e.state)),
      };
    },
  });

  return (
    <Page title="Evidence review queue">
      {error && <Notice>{(error as Error).message}</Notice>}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && data.evidence.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground">
            No evidence waiting for review.
          </p>
        </Card>
      )}
      {data?.evidence.map((item) => {
        const order = data.orders.find((o) => o.id === item.orderId);
        if (!order) return null;
        return (
          <ReviewItem
            key={item.id}
            member={member}
            evidence={item}
            orderLabel={`WO ${order.wo} · ${order.siteId}`}
            orderId={order.id}
            order={order}
          />
        );
      })}
    </Page>
  );
}

function ReviewItem({
  member,
  evidence,
  orderLabel,
  orderId,
  order,
}: {
  member: Member;
  evidence: Evidence;
  orderLabel: string;
  orderId: string;
  order: Order;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const review = useMutation({
    mutationFn: (state: "Accepted" | "Retake required") =>
      reviewEvidence({ order, member, evidence, state, note: note.trim() }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["review"] });
      void queryClient.invalidateQueries({ queryKey: ["evidence", orderId] });
    },
    onError: (err) => setError((err as Error).message),
  });

  return (
    <Card>
      <div className="flex gap-3">
        <EvidenceImage evidence={evidence} />
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <p className="font-medium">{orderLabel}</p>
          <p className="text-xs text-muted-foreground">
            {evidence.state} · captured {formatTime(evidence.capturedAt)} · ETL{" "}
            {evidence.linkedEtls.join(", ")}
          </p>
          <Link to={`/orders/${orderId}`} className="text-xs underline">
            Open work order
          </Link>
          <input
            aria-label="Review note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Review note"
            className="w-full rounded-md border bg-background px-2 py-1.5"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={review.isPending || !canReviewEvidence(member, order)}
              onClick={() => review.mutate("Accepted")}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={
                review.isPending ||
                !canReviewEvidence(member, order) ||
                note.trim() === ""
              }
              onClick={() => review.mutate("Retake required")}
            >
              Request retake
            </Button>
          </div>
          {error && <Notice>{error}</Notice>}
        </div>
      </div>
    </Card>
  );
}
