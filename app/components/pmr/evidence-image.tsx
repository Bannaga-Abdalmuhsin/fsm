import type { Evidence } from "@shared/records";
import { useQuery } from "@tanstack/react-query";

import { signedEvidenceUrl } from "@/lib/pmr-api";

export function EvidenceImage({ evidence }: { evidence: Evidence }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["evidence-url", evidence.bucket, evidence.path],
    queryFn: () => signedEvidenceUrl(evidence),
    staleTime: 4 * 60 * 1000,
  });
  if (isLoading)
    return <div className="h-24 w-24 animate-pulse rounded bg-muted" />;
  if (error || !data) {
    return (
      <div className="flex h-24 w-24 items-center justify-center rounded bg-muted text-xs">
        Unavailable
      </div>
    );
  }
  return (
    <img
      src={data}
      alt="Captured evidence"
      className="h-24 w-24 rounded object-cover"
    />
  );
}
