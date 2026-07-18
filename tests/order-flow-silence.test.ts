import { describe, expect, it, vi } from "vitest";
import { orderFlowSilenceRule } from "../supabase/functions/_shared/rules/order-flow-silence.ts";
import type { RuleContext } from "../supabase/functions/_shared/rules/types.ts";

const NOW = new Date("2026-07-16T12:00:00Z");

const response = (lastOrderAt: string | null, weeklyCount: number) => ({
  latest: {
    nodes: lastOrderAt
      ? [{
        id: "gid://shopify/Order/900",
        name: "#900",
        createdAt: lastOrderAt,
      }]
      : [],
  },
  weekly: { count: weeklyCount },
});

const baseCtx = (
  graphql: RuleContext["graphql"],
  thresholds: Record<string, unknown> = {},
): RuleContext => ({
  shopId: "shop-uuid-1",
  shopDomain: "dev-store.myshopify.com",
  graphql,
  thresholds: { ...orderFlowSilenceRule.defaultThresholds, ...thresholds },
  now: NOW,
});

describe("order-flow-silence rule", () => {
  it("flags a busy store that has gone quiet past the threshold", async () => {
    // last order 30h ago, 25 orders in the prior week
    const graphql = vi.fn().mockResolvedValue(
      response("2026-07-15T06:00:00Z", 25),
    );
    const detected = await orderFlowSilenceRule.detect(baseCtx(graphql));
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      ruleId: "order-flow-silence",
      resourceType: "shop",
      resourceId: "order-flow",
      severity: "high",
      salientState: "quiet",
    });
    expect(detected[0]!.details).toMatchObject({
      quiet_hours: 30,
      threshold_hours: 24,
      last_order_name: "#900",
      weekly_orders: 25,
    });
  });

  it("stays silent while orders are flowing", async () => {
    const graphql = vi.fn().mockResolvedValue(
      response("2026-07-16T09:00:00Z", 25), // 3h ago
    );
    expect(await orderFlowSilenceRule.detect(baseCtx(graphql))).toEqual([]);
  });

  it("skips low-volume stores below the weekly floor", async () => {
    const graphql = vi.fn().mockResolvedValue(
      response("2026-07-10T00:00:00Z", 3), // long quiet, but only 3/week
    );
    expect(await orderFlowSilenceRule.detect(baseCtx(graphql))).toEqual([]);
  });

  it("respects per-shop threshold overrides", async () => {
    const graphql = vi.fn().mockResolvedValue(
      response("2026-07-16T05:00:00Z", 6), // 7h quiet, 6 weekly
    );
    const detected = await orderFlowSilenceRule.detect(
      baseCtx(graphql, { max_quiet_hours: 6, min_weekly_orders: 5 }),
    );
    expect(detected).toHaveLength(1);
    expect(detected[0]!.details.threshold_hours).toBe(6);
  });
});
