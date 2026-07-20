import { describe, expect, it, vi } from "vitest";
import { refundSpikeRule } from "../supabase/functions/_shared/rules/refund-spike.ts";
import type { RuleContext } from "../supabase/functions/_shared/rules/types.ts";

const NOW = new Date("2026-07-16T12:00:00Z");

const response = (recentAmounts: number[], baselineCount: number) => ({
  recent: {
    nodes: recentAmounts.map((amount, i) => ({
      id: `gid://shopify/Order/${i}`,
      name: `#${1000 + i}`,
      totalRefundedSet: { shopMoney: { amount: String(amount) } },
    })),
  },
  baseline: { count: baselineCount },
});

const baseCtx = (graphql: RuleContext["graphql"]): RuleContext => ({
  shopId: "shop-uuid-1",
  shopDomain: "dev-store.myshopify.com",
  graphql,
  thresholds: { ...refundSpikeRule.defaultThresholds },
  now: NOW,
});

describe("refund-spike rule", () => {
  it("flags a spike vs the weekly baseline and sums refunded revenue", async () => {
    // 6 refunds today vs 7 all last week (1/day baseline)
    const graphql = vi.fn().mockResolvedValue(
      response([50, 40, 30, 20, 10, 25], 7),
    );
    const detected = await refundSpikeRule.detect(baseCtx(graphql));
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      resourceType: "shop",
      resourceId: "refunds",
      severity: "high",
      salientState: "spike:2026-07-16",
      revenueAtRisk: 175,
    });
    expect(detected[0]!.details).toMatchObject({ refunds_24h: 6 });
  });

  it("ignores normal refund volume", async () => {
    // 3 refunds today, baseline 14/week = 2/day → 3 < 2×3
    const graphql = vi.fn().mockResolvedValue(response([10, 10, 10], 14));
    expect(await refundSpikeRule.detect(baseCtx(graphql))).toEqual([]);
  });

  it("ignores counts under the absolute minimum", async () => {
    const graphql = vi.fn().mockResolvedValue(response([500, 300], 0));
    expect(await refundSpikeRule.detect(baseCtx(graphql))).toEqual([]);
  });
});
