// v1 alert channel: email via SendGrid. Every dispatch is recorded in
// action_logs (the audit trail), success or failure.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env } from "./env.ts";
import type { ExceptionInsert } from "./rules/engine.ts";

async function sendgridSend(
  to: string,
  subject: string,
  text: string,
): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: env.alertFromEmail, name: "Shopify Ops Monitor" },
      subject,
      content: [{ type: "text/plain", value: text }],
    }),
  });
  if (res.status === 202) return { ok: true, detail: "sent" };
  const body = await res.text().catch(() => "");
  return { ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 500)}` };
}

async function recipientsFor(
  supabase: SupabaseClient,
  shopId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("alert_channels")
    .select("type, config")
    .eq("shop_id", shopId)
    .eq("enabled", true)
    .eq("type", "email");
  const emails = (data ?? [])
    .map((c) => (c.config as { to?: string }).to)
    .filter((e): e is string => !!e);
  if (emails.length) return emails;
  return env.alertDefaultTo ? [env.alertDefaultTo] : [];
}

export async function dispatchAlert(
  supabase: SupabaseClient,
  shopDomain: string,
  exceptionId: string,
  exc: ExceptionInsert,
): Promise<void> {
  const to = await recipientsFor(supabase, exc.shop_id);
  const subject =
    `[${exc.severity.toUpperCase()}] ${exc.rule_id} — ${shopDomain}`;
  const text = [
    `Shop:      ${shopDomain}`,
    `Rule:      ${exc.rule_id}`,
    `Severity:  ${exc.severity}`,
    `Resource:  ${exc.resource_type} ${exc.resource_id}`,
    ``,
    `Details:`,
    JSON.stringify(exc.details, null, 2),
    ``,
    `Dashboard: ${env.dashboardUrl}`,
  ].join("\n");

  let result = "no_recipients";
  if (to.length) {
    const outcomes = await Promise.all(
      to.map((addr) => sendgridSend(addr, subject, text)),
    );
    result = outcomes.every((o) => o.ok)
      ? "sent"
      : `error: ${outcomes.find((o) => !o.ok)?.detail}`;
  }

  await supabase.from("action_logs").insert({
    shop_id: exc.shop_id,
    exception_id: exceptionId,
    action_type: "alert:email",
    payload: { to, subject },
    result,
  });
}
