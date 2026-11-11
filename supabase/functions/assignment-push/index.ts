import { createClient } from "npm:@supabase/supabase-js@2.118.0";

type Job = { id: number; token: string; attempts: number };
type Ticket = { status: "ok" | "error"; details?: { error?: string } };

Deno.serve(async (request) => {
  const secret = Deno.env.get("PMR_PUSH_DISPATCH_SECRET");
  if (request.method !== "POST" || !secret || request.headers.get("x-pmr-dispatch-secret") !== secret) {
    return new Response(null, { status: 403 });
  }

  const expoAccessToken = Deno.env.get("PMR_EXPO_PUSH_ACCESS_TOKEN");
  if (!expoAccessToken) return new Response("Expo push credential missing", { status: 503 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await supabase.rpc("pmr_claim_assignment_push");
  if (error) return new Response("Unable to claim push jobs", { status: 503 });
  const jobs = (data ?? []) as Job[];
  if (!jobs.length) return Response.json({ accepted: 0 });

  let tickets: Ticket[];
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${expoAccessToken}`,
      },
      body: JSON.stringify(jobs.map(({ token }) => ({
        to: token,
        title: "New work order",
        body: "Open BM FSM PMR to view your assignment.",
        data: { type: "pmr-assignment" },
        channelId: "work-orders",
        sound: "default",
      }))),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("Push gateway rejected batch");
    const result = await response.json();
    if (!Array.isArray(result.data) || result.data.length !== jobs.length) {
      throw new Error("Incomplete push gateway response");
    }
    tickets = result.data;
  } catch {
    return new Response("Push gateway unavailable. Jobs will retry after the lease expires.", { status: 502 });
  }

  let accepted = 0;
  let writeErrors = 0;
  for (const [index, job] of jobs.entries()) {
    const ticket = tickets[index];
    if (ticket.status === "ok" || job.attempts >= 5 || ticket.details?.error === "DeviceNotRegistered") {
      const { error: updateError } = await supabase.from("pmr_assignment_push")
        .update({ finished_at: new Date().toISOString() })
        .eq("id", job.id).eq("attempts", job.attempts);
      if (updateError) writeErrors++;
    }
    if (ticket.status === "ok") accepted++;
  }
  return Response.json({ accepted, writeErrors }, { status: writeErrors ? 503 : 200 });
});
