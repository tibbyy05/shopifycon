// Alert dispatch: email (SendGrid) and Slack (incoming webhooks). Every
// dispatch is recorded in action_logs (the audit trail), success or
// failure. Channels come from alert_channels; when a shop has no
// enabled email channel, ALERT_DEFAULT_TO is the fallback recipient.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env } from "./env.ts";
import type { ExceptionInsert } from "./rules/engine.ts";

export interface AlertChannel {
  type: "email" | "slack";
  config: { to?: string; webhook_url?: string };
}

interface SendResult {
  ok: boolean;
  detail: string;
}

const RULE_LABELS: Record<string, string> = {
  "aging-unfulfilled": "Aging unfulfilled order",
  "order-flow-silence": "Order flow silence",
  "inventory-low": "Inventory low or oversold",
  "stuck-fulfillment": "Stuck partial fulfillment",
};
const ruleLabel = (id: string) => RULE_LABELS[id] ?? id;

const SEVERITY_COLOR: Record<string, string> = {
  high: "#dc2626",
  medium: "#d97706",
  low: "#64748b",
};

const ADMIN_PATHS: Record<string, string> = {
  order: "orders",
  product: "products",
  customer: "customers",
};

/** Deep link into the Shopify admin for a monitored resource. */
export function adminResourceUrl(
  shopDomain: string,
  resourceType: string,
  resourceId: string,
  details: Record<string, unknown> = {},
): string | null {
  const handle = shopDomain.replace(/\.myshopify\.com$/, "");
  const base = `https://admin.shopify.com/store/${handle}`;
  // Shop-level exceptions (e.g. order-flow silence) link to the orders list.
  if (resourceType === "shop") return `${base}/orders`;
  if (
    resourceType === "variant" &&
    typeof details.product_id === "string" &&
    /^\d+$/.test(resourceId)
  ) {
    return `${base}/products/${details.product_id}/variants/${resourceId}`;
  }
  const path = ADMIN_PATHS[resourceType];
  if (!path || !/^\d+$/.test(resourceId)) return null;
  return `${base}/${path}/${resourceId}`;
}

// ── content ─────────────────────────────────────────────────────────

export interface AlertContent {
  shopDomain: string;
  ruleId: string;
  severity: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  test?: boolean;
}

function headline(c: AlertContent): string {
  const d = c.details;
  if (c.ruleId === "order-flow-silence") {
    return `No orders for ${d.quiet_hours ?? "?"}h`;
  }
  if (c.ruleId === "inventory-low") {
    const name = [d.product_title, d.variant_title]
      .filter((s) => typeof s === "string" && s && s !== "Default Title")
      .join(" / ");
    return `${ruleLabel(c.ruleId)} — ${name || `variant ${c.resourceId}`}`;
  }
  const name = typeof d.order_name === "string"
    ? d.order_name
    : `${c.resourceType} ${c.resourceId}`;
  return `${ruleLabel(c.ruleId)} — ${name}`;
}

function factLines(c: AlertContent): [string, string][] {
  const d = c.details;
  const facts: [string, string][] = [["Store", c.shopDomain]];
  if (d.age_hours != null) {
    facts.push(["Age", `${d.age_hours}h (threshold ${d.threshold_hours}h)`]);
  }
  if (d.quiet_hours != null) {
    facts.push([
      "Quiet for",
      `${d.quiet_hours}h (threshold ${d.threshold_hours}h)`,
    ]);
    if (typeof d.last_order_name === "string") {
      facts.push(["Last order", d.last_order_name]);
    }
    if (d.weekly_orders != null) {
      facts.push(["Orders last 7 days", String(d.weekly_orders)]);
    }
  }
  if (d.available != null) {
    facts.push(["Available", `${d.available} (threshold ${d.threshold})`]);
    if (typeof d.sku === "string" && d.sku) facts.push(["SKU", d.sku]);
  }
  const total = d.total as { amount?: string; currencyCode?: string } | null;
  if (total?.amount) {
    facts.push(["Order total", `${total.amount} ${total.currencyCode ?? ""}`]);
  }
  if (typeof d.financial_status === "string") {
    facts.push(["Payment", d.financial_status.toLowerCase()]);
  }
  if (typeof d.fulfillment_status === "string") {
    facts.push(["Fulfillment", d.fulfillment_status.toLowerCase()]);
  }
  return facts;
}

export function emailSubject(c: AlertContent): string {
  const prefix = c.test ? "[TEST] " : "";
  return `${prefix}[${c.severity.toUpperCase()}] ${headline(c)} — ${c.shopDomain}`;
}

export function emailText(c: AlertContent): string {
  const adminUrl = adminResourceUrl(c.shopDomain, c.resourceType, c.resourceId, c.details);
  return [
    ...(c.test ? ["This is a test alert from Shopify Ops Monitor.", ""] : []),
    headline(c),
    `Severity: ${c.severity}`,
    ...factLines(c).map(([k, v]) => `${k}: ${v}`),
    ``,
    ...(adminUrl ? [`Open in Shopify admin: ${adminUrl}`] : []),
    `Dashboard: ${env.dashboardUrl}`,
  ].join("\n");
}

export function emailHtml(c: AlertContent): string {
  const color = SEVERITY_COLOR[c.severity] ?? "#64748b";
  const adminUrl = adminResourceUrl(c.shopDomain, c.resourceType, c.resourceId, c.details);
  const rows = factLines(c)
    .map(
      ([k, v]) => `
        <tr>
          <td style="padding:6px 16px 6px 0;color:#64748b;font-size:14px;white-space:nowrap;">${k}</td>
          <td style="padding:6px 0;color:#0f172a;font-size:14px;">${v}</td>
        </tr>`,
    )
    .join("");
  const button = (href: string, label: string, solid: boolean) => `
    <a href="${href}" style="display:inline-block;margin-right:8px;padding:9px 16px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;${
    solid
      ? "background:#047857;color:#ffffff;"
      : "background:#f1f5f9;color:#0f172a;"
  }">${label}</a>`;

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    ${
    c.test
      ? `<p style="margin:0 0 12px;padding:8px 12px;background:#fef9c3;border-radius:6px;color:#854d0e;font-size:13px;">This is a test alert — your channel is wired up correctly.</p>`
      : ""
  }
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <div style="padding:16px 24px;border-bottom:1px solid #e2e8f0;">
        <span style="display:inline-block;padding:2px 10px;border-radius:99px;background:${color};color:#ffffff;font-size:12px;font-weight:600;text-transform:uppercase;">${c.severity}</span>
        <h1 style="margin:10px 0 0;font-size:18px;color:#0f172a;">${headline(c)}</h1>
      </div>
      <div style="padding:16px 24px;">
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
        <div style="margin-top:20px;">
          ${adminUrl ? button(adminUrl, "Open in Shopify admin", true) : ""}
          ${button(env.dashboardUrl, "Open dashboard", false)}
        </div>
      </div>
    </div>
    <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">Shopify Ops Monitor · automated operations alert</p>
  </div>
</body></html>`;
}

function slackPayload(c: AlertContent): Record<string, unknown> {
  const adminUrl = adminResourceUrl(c.shopDomain, c.resourceType, c.resourceId, c.details);
  const facts = factLines(c)
    .map(([k, v]) => `*${k}:* ${v}`)
    .join("\n");
  const links = [
    ...(adminUrl ? [`<${adminUrl}|Open in Shopify admin>`] : []),
    `<${env.dashboardUrl}|Open dashboard>`,
  ].join("  ·  ");
  return {
    text: emailSubject(c),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${c.test ? ":white_check_mark: *Test alert* — " : ""}*[${c.severity.toUpperCase()}] ${headline(c)}*\n${facts}`,
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: links }],
      },
    ],
  };
}

// ── senders ─────────────────────────────────────────────────────────

async function sendEmail(to: string, c: AlertContent): Promise<SendResult> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: env.alertFromEmail, name: "Shopify Ops Monitor" },
      subject: emailSubject(c),
      content: [
        { type: "text/plain", value: emailText(c) },
        { type: "text/html", value: emailHtml(c) },
      ],
    }),
  });
  if (res.status === 202) return { ok: true, detail: "sent" };
  const body = await res.text().catch(() => "");
  return { ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 500)}` };
}

async function sendSlack(
  webhookUrl: string,
  c: AlertContent,
): Promise<SendResult> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(slackPayload(c)),
  });
  if (res.ok) return { ok: true, detail: "sent" };
  const body = await res.text().catch(() => "");
  return { ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 200)}` };
}

/** Send to one channel. Exported for the alert-test function. */
export async function sendToChannel(
  channel: AlertChannel,
  c: AlertContent,
): Promise<SendResult> {
  if (channel.type === "email") {
    if (!channel.config.to) return { ok: false, detail: "no recipient" };
    return await sendEmail(channel.config.to, c);
  }
  if (!channel.config.webhook_url) {
    return { ok: false, detail: "no webhook url" };
  }
  return await sendSlack(channel.config.webhook_url, c);
}

// ── dispatch ────────────────────────────────────────────────────────

export async function dispatchAlert(
  supabase: SupabaseClient,
  shopDomain: string,
  exceptionId: string,
  exc: ExceptionInsert,
): Promise<void> {
  const content: AlertContent = {
    shopDomain,
    ruleId: exc.rule_id,
    severity: exc.severity,
    resourceType: exc.resource_type,
    resourceId: exc.resource_id,
    details: exc.details,
  };

  const { data } = await supabase
    .from("alert_channels")
    .select("type, config")
    .eq("shop_id", exc.shop_id)
    .eq("enabled", true);
  const channels = (data ?? []) as AlertChannel[];

  // No configured email channel → fall back to the operator default.
  if (
    !channels.some((ch) => ch.type === "email") &&
    env.alertDefaultTo
  ) {
    channels.push({ type: "email", config: { to: env.alertDefaultTo } });
  }

  if (!channels.length) {
    await supabase.from("action_logs").insert({
      shop_id: exc.shop_id,
      exception_id: exceptionId,
      action_type: "alert:none",
      payload: {},
      result: "no_channels",
    });
    return;
  }

  for (const channel of channels) {
    const result = await sendToChannel(channel, content);
    await supabase.from("action_logs").insert({
      shop_id: exc.shop_id,
      exception_id: exceptionId,
      action_type: `alert:${channel.type}`,
      payload: {
        to: channel.type === "email"
          ? channel.config.to
          : "slack webhook",
        subject: emailSubject(content),
      },
      result: result.ok ? "sent" : `error: ${result.detail}`,
    });
  }
}
