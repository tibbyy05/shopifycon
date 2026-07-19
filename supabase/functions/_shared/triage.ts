// AI triage: a short diagnosis + recommended next action for a freshly
// opened exception, written by Claude. Runs inside the sweep before
// alerts dispatch so every alert arrives pre-investigated. Failures
// never block detection or alerting — callers get null and move on.

import Anthropic from "npm:@anthropic-ai/sdk";
import { env } from "./env.ts";

export interface Triage {
  summary: string;
  recommendation: string;
}

const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "2-3 sentences: what happened and the most likely cause, grounded in the data provided.",
    },
    recommendation: {
      type: "string",
      description:
        "One concrete next action the merchant should take, imperative mood.",
    },
  },
  required: ["summary", "recommendation"],
  additionalProperties: false,
} as const;

const SYSTEM = `You are the triage engine inside a read-only Shopify \
operations monitor. Merchants receive your words inside an alert about a \
store problem the monitor just detected. Diagnose plainly and recommend \
one concrete action. Ground every claim in the data provided — never \
invent order details, causes you cannot support, or Shopify features. \
Write for a busy store owner: plain language, no hedging boilerplate, no \
greetings. The merchant fixes things in the Shopify admin; the monitor \
itself is read-only.`;

const RULE_CONTEXT: Record<string, string> = {
  "aging-unfulfilled":
    "Rule: a paid, open order has not started fulfillment within the shop's time limit. Common causes: out-of-stock items, fulfillment app failures, unstaffed queue, shipping-zone gaps, or a high-risk hold.",
  "order-flow-silence":
    "Rule: a store with meaningful weekly volume has received no orders for longer than its quiet window. Common causes: broken checkout, payment gateway outage, theme/app deploy breaking the storefront, domain/DNS issues, or a killed sales channel.",
  "inventory-low":
    "Rule: a tracked variant on an active product is at or below its stock threshold; negative means oversold. Common causes: missed restock, double-selling across channels, inventory sync failures.",
  "stuck-fulfillment":
    "Rule: a paid order was partially fulfilled and then stalled past the time limit. Common causes: split shipments where one item is out of stock, carrier pickup failures, or a fulfillment service processing only part of the order.",
};

/**
 * Generate triage for one exception. Returns null when no API key is
 * configured or the call fails — never throws.
 */
export async function generateTriage(input: {
  ruleId: string;
  shopDomain: string;
  severity: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  revenueAtRisk?: number | null;
}): Promise<Triage | null> {
  if (!env.anthropicApiKey) return null;

  try {
    const client = new Anthropic({
      apiKey: env.anthropicApiKey,
      timeout: 45_000,
      maxRetries: 1,
    });

    const response = await client.messages.create({
      model: env.triageModel,
      max_tokens: 4000,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: TRIAGE_SCHEMA,
        },
      },
      messages: [
        {
          role: "user",
          content: [
            RULE_CONTEXT[input.ruleId] ?? `Rule id: ${input.ruleId}.`,
            ``,
            `Store: ${input.shopDomain}`,
            `Severity: ${input.severity}`,
            ...(input.revenueAtRisk != null && input.revenueAtRisk > 0
              ? [`Estimated revenue at risk: $${input.revenueAtRisk}`]
              : []),
            `Resource: ${input.resourceType} ${input.resourceId}`,
            `Detection data: ${JSON.stringify(input.details)}`,
          ].join("\n"),
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const parsed = JSON.parse(text.text) as Triage;
    if (!parsed.summary || !parsed.recommendation) return null;
    return {
      summary: String(parsed.summary),
      recommendation: String(parsed.recommendation),
    };
  } catch (e) {
    console.error("triage generation failed:", e);
    return null;
  }
}
