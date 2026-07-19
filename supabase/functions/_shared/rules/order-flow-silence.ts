// Rule #2 — Order flow silence.
// A store that normally receives orders has had none for longer than the
// quiet window. This is how broken checkouts, payment-gateway outages,
// and killed sales channels get noticed — the most expensive failures a
// store can have. Stores below the weekly-volume floor are skipped so
// dormant/seasonal shops don't false-positive.

import type {
  DetectedException,
  ExceptionRule,
  RuleContext,
} from "./types.ts";

const SILENCE_QUERY = /* GraphQL */ `
  query OrderFlowSilence($weeklyQ: String!) {
    latest: orders(first: 1, sortKey: CREATED_AT, reverse: true) {
      nodes { id name createdAt }
    }
    weekly: ordersCount(query: $weeklyQ) { count }
    recent: orders(first: 50, query: $weeklyQ, sortKey: CREATED_AT, reverse: true) {
      nodes { totalPriceSet { shopMoney { amount } } }
    }
  }
`;

export const orderFlowSilenceRule: ExceptionRule = {
  id: "order-flow-silence",
  name: "Order flow silence",
  severity: "high",
  trigger: "scheduled",
  schedule: "0 * * * *",
  defaultThresholds: { max_quiet_hours: 24, min_weekly_orders: 10 },
  defaultAction: { type: "alert" },

  async detect(ctx: RuleContext): Promise<DetectedException[]> {
    const quietHours = Number(ctx.thresholds.max_quiet_hours ?? 24);
    const minWeekly = Number(ctx.thresholds.min_weekly_orders ?? 10);
    const weekAgo = new Date(ctx.now.getTime() - 7 * 24 * 3600_000);

    const data = await ctx.graphql(SILENCE_QUERY, {
      weeklyQ: `created_at:>='${weekAgo.toISOString()}'`,
    });
    const latest = (data.latest as {
      nodes: { id: string; name: string; createdAt: string }[];
    }).nodes[0];
    const weeklyCount = (data.weekly as { count: number } | null)?.count ?? 0;

    // Not enough recent volume to expect a steady flow.
    if (weeklyCount < minWeekly) return [];

    const lastAt = latest ? new Date(latest.createdAt) : null;
    const quietHoursActual = lastAt
      ? Math.floor((ctx.now.getTime() - lastAt.getTime()) / 3600_000)
      : Infinity;
    if (quietHoursActual < quietHours) return [];

    // Daily revenue run-rate from the last week's orders (first 50 —
    // an underestimate on busier stores, so "at least this much").
    const recentNodes = (data.recent as {
      nodes: { totalPriceSet?: { shopMoney?: { amount?: string } } }[];
    } | null)?.nodes ?? [];
    const weeklyRevenue = recentNodes.reduce((sum, n) => {
      const v = Number(n.totalPriceSet?.shopMoney?.amount);
      return Number.isFinite(v) ? sum + v : sum;
    }, 0);
    const dailyRevenue = weeklyRevenue / 7;
    const quietH = Number.isFinite(quietHoursActual) ? quietHoursActual : 0;
    const missed = dailyRevenue > 0
      ? Math.round(dailyRevenue * (quietH / 24) * 100) / 100
      : null;

    return [{
      ruleId: orderFlowSilenceRule.id,
      resourceType: "shop",
      resourceId: "order-flow",
      severity: orderFlowSilenceRule.severity,
      revenueAtRisk: missed,
      salientState: "quiet",
      details: {
        quiet_hours: Number.isFinite(quietHoursActual) ? quietHoursActual : null,
        threshold_hours: quietHours,
        last_order_name: latest?.name ?? null,
        last_order_at: latest?.createdAt ?? null,
        weekly_orders: weeklyCount,
        expected_daily_revenue: dailyRevenue > 0
          ? Math.round(dailyRevenue * 100) / 100
          : null,
      },
    }];
  },
};
