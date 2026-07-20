// Rule #7 — Refund spike.
// Refund volume in the last 24h is abnormally high vs the store's own
// 7-day baseline. Catches product defects, fulfillment disasters, and
// fraud waves while they're still hours old.

import type {
  DetectedException,
  ExceptionRule,
  RuleContext,
} from "./types.ts";

const REFUNDS_QUERY = /* GraphQL */ `
  query RefundSpike($recentQ: String!, $baseQ: String!) {
    recent: orders(first: 50, query: $recentQ, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        name
        totalRefundedSet { shopMoney { amount } }
      }
    }
    baseline: ordersCount(query: $baseQ) { count }
  }
`;

const REFUND_STATUS =
  "(financial_status:refunded OR financial_status:partially_refunded)";

export const refundSpikeRule: ExceptionRule = {
  id: "refund-spike",
  name: "Refund spike",
  severity: "high",
  trigger: "scheduled",
  schedule: "0 * * * *",
  defaultThresholds: { min_refunds_24h: 3, spike_multiplier: 3 },
  defaultAction: { type: "alert" },

  async detect(ctx: RuleContext): Promise<DetectedException[]> {
    const minRefunds = Number(ctx.thresholds.min_refunds_24h ?? 3);
    const multiplier = Number(ctx.thresholds.spike_multiplier ?? 3);
    const dayAgo = new Date(ctx.now.getTime() - 24 * 3600_000);
    const eightDaysAgo = new Date(ctx.now.getTime() - 8 * 24 * 3600_000);

    const data = await ctx.graphql(REFUNDS_QUERY, {
      recentQ: `${REFUND_STATUS} AND updated_at:>='${dayAgo.toISOString()}'`,
      baseQ: `${REFUND_STATUS} AND updated_at:>='${eightDaysAgo.toISOString()}' AND updated_at:<'${dayAgo.toISOString()}'`,
    });

    const recent = (data.recent as {
      nodes: {
        id: string;
        name: string;
        totalRefundedSet?: { shopMoney?: { amount?: string } };
      }[];
    }).nodes;
    const baselineCount = (data.baseline as { count: number } | null)?.count ??
      0;

    const recentCount = recent.length;
    const dailyBaseline = baselineCount / 7;

    if (recentCount < minRefunds) return [];
    if (dailyBaseline > 0 && recentCount < dailyBaseline * multiplier) {
      return [];
    }

    const refunded = recent.reduce((sum, o) => {
      const v = Number(o.totalRefundedSet?.shopMoney?.amount);
      return Number.isFinite(v) ? sum + v : sum;
    }, 0);
    const day = ctx.now.toISOString().slice(0, 10);

    return [{
      ruleId: refundSpikeRule.id,
      resourceType: "shop",
      resourceId: "refunds",
      severity: refundSpikeRule.severity,
      revenueAtRisk: refunded > 0 ? Math.round(refunded * 100) / 100 : null,
      salientState: `spike:${day}`,
      details: {
        headline: `${recentCount} refunds in 24h`,
        refunds_24h: recentCount,
        daily_baseline: Math.round(dailyBaseline * 100) / 100,
        refunded_total: Math.round(refunded * 100) / 100,
        sample_orders: recent.slice(0, 5).map((o) => o.name),
      },
    }];
  },
};
