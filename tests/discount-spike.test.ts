import { describe, expect, it, vi } from "vitest";
import { discountSpikeRule } from "../supabase/functions/_shared/rules/discount-spike.ts";
import type { RuleContext } from "../supabase/functions/_shared/rules/types.ts";

const NOW = new Date("2026-07-16T12:00:00Z");

const orderNode = (id: number, paid: number, discount: number) => ({
  id: `gid://shopify/Order/${id}`,
  name: `#${id}`,
  totalPriceSet: { shopMoney: { amount: String(paid) } },
  totalDiscountsSet: { shopMoney: { amount: String(discount) } },
});

const page = (nodes: unknown[]) => ({ orders: { nodes } });

const baseCtx = (graphql: RuleContext["graphql"]): RuleContext => ({
  shopId: "shop-uuid-1",
  shopDomain: "dev-store.myshopify.com",
  graphql,
  thresholds: { ...discountSpikeRule.defaultThresholds },
  now: NOW,
});

describe("discount-spike rule", () => {
  it("flags several heavily discounted orders and sums the margin", async () => {
    const graphql = vi.fn().mockResolvedValue(page([
      orderNode(1, 50, 50), // 50% off
      orderNode(2, 20, 80), // 80% off
      orderNode(3, 0, 40), // 100% off
      orderNode(4, 90, 10), // 10% off — ignored
    ]));
    const detected = await discountSpikeRule.detect(baseCtx(graphql));
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      resourceType: "shop",
      resourceId: "discounts",
      salientState: "discounts:2026-07-16",
      revenueAtRisk: 170,
    });
    expect(detected[0]!.details).toMatchObject({
      discounted_orders: 3,
      threshold_pct: 50,
    });
  });

  it("stays quiet below the minimum order count", async () => {
    const graphql = vi.fn().mockResolvedValue(page([
      orderNode(5, 10, 90),
      orderNode(6, 5, 45),
    ]));
    expect(await discountSpikeRule.detect(baseCtx(graphql))).toEqual([]);
  });
});
