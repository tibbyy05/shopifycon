// Rule #9 — Unusual discounting.
// Multiple orders in the last 24h were sold at a discount at or above
// the percentage threshold. Catches leaked/abused discount codes and
// misconfigured automatic discounts eating margin.

import type {
  DetectedException,
  ExceptionRule,
  RuleContext,
} from "./types.ts";

const ORDERS_QUERY = /* GraphQL */ `
  query DiscountSpike($q: String!) {
    orders(first: 50, query: $q, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        totalPriceSet { shopMoney { amount } }
        totalDiscountsSet { shopMoney { amount } }
      }
    }
  }
`;

export const discountSpikeRule: ExceptionRule = {
  id: "discount-spike",
  name: "Unusual discounting",
  severity: "medium",
  trigger: "scheduled",
  schedule: "0 * * * *",
  defaultThresholds: { max_discount_pct: 50, min_discounted_orders: 3 },
  defaultAction: { type: "alert" },

  async detect(ctx: RuleContext): Promise<DetectedException[]> {
    const maxPct = Number(ctx.thresholds.max_discount_pct ?? 50);
    const minOrders = Number(ctx.thresholds.min_discounted_orders ?? 3);
    const dayAgo = new Date(ctx.now.getTime() - 24 * 3600_000);

    const data = await ctx.graphql(ORDERS_QUERY, {
      q: `created_at:>='${dayAgo.toISOString()}'`,
    });
    const orders = (data.orders as {
      nodes: {
        name: string;
        totalPriceSet?: { shopMoney?: { amount?: string } };
        totalDiscountsSet?: { shopMoney?: { amount?: string } };
      }[];
    }).nodes;

    const heavy: { name: string; discount: number; pct: number }[] = [];
    for (const o of orders) {
      const discount = Number(o.totalDiscountsSet?.shopMoney?.amount);
      const paid = Number(o.totalPriceSet?.shopMoney?.amount);
      if (!Number.isFinite(discount) || discount <= 0) continue;
      const original = discount + (Number.isFinite(paid) ? paid : 0);
      if (original <= 0) continue;
      const pct = (discount / original) * 100;
      if (pct >= maxPct) {
        heavy.push({ name: o.name, discount, pct: Math.round(pct) });
      }
    }

    if (heavy.length < minOrders) return [];

    const totalDiscount = heavy.reduce((s, h) => s + h.discount, 0);
    const day = ctx.now.toISOString().slice(0, 10);

    return [{
      ruleId: discountSpikeRule.id,
      resourceType: "shop",
      resourceId: "discounts",
      severity: discountSpikeRule.severity,
      revenueAtRisk: Math.round(totalDiscount * 100) / 100,
      salientState: `discounts:${day}`,
      details: {
        headline: `${heavy.length} heavily discounted orders in 24h`,
        discounted_orders: heavy.length,
        threshold_pct: maxPct,
        margin_given_away: Math.round(totalDiscount * 100) / 100,
        sample_orders: heavy.slice(0, 5).map((h) =>
          `${h.name} (-${h.pct}%)`
        ),
      },
    }];
  },
};
