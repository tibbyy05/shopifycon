// Public health probe for external uptime monitors (UptimeRobot, cron
// pings, etc.). Reports whether the hourly sweep is running on schedule
// — the one failure mode the sweep can't alert on itself is its own
// absence. Returns 200 while fresh, 503 when stale, and only aggregate
// numbers (never tenant data).

import { serviceClient } from "../_shared/db.ts";

// The sweep is hourly; anything past 90 minutes means a missed run.
const STALE_MINUTES = 90;

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("method not allowed", { status: 405 });
  }

  const supabase = serviceClient();

  const [{ data: run }, { count: deadLetters }] = await Promise.all([
    supabase
      .from("sweep_runs")
      .select("finished_at, status, shops_processed, shops_failed")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("webhook_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "dead_letter")
      .gte("received_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
  ]);

  const ageMinutes = run
    ? Math.floor((Date.now() - new Date(run.finished_at).getTime()) / 60_000)
    : null;
  const fresh = ageMinutes !== null && ageMinutes <= STALE_MINUTES;

  const body = {
    ok: fresh,
    last_sweep_at: run?.finished_at ?? null,
    last_sweep_status: run?.status ?? null,
    age_minutes: ageMinutes,
    stale_after_minutes: STALE_MINUTES,
    shops_processed: run?.shops_processed ?? 0,
    shops_failed: run?.shops_failed ?? 0,
    dead_letter_webhooks_24h: deadLetters ?? 0,
  };

  return new Response(JSON.stringify(body), {
    status: fresh ? 200 : 503,
    headers: { "Content-Type": "application/json" },
  });
});
