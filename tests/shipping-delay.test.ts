import { describe, expect, it, vi } from "vitest";
import { shippingDelayRule } from "../supabase/functions/_shared/rules/shipping-delay.ts";
import type { RuleContext } from "../supabase/functions/_shared/rules/types.ts";

const NOW = new Date("2026-07-16T12:00:00Z");

const orderNode = (
  id: number,
  fulfillments: {
    createdAt: string;
    deliveredAt?: string | null;
    displayStatus?: string | null;
  }[],
) => ({
  id: `gid://shopify/Order/${id}`,
  name: `#${id}`,
  createdAt: "2026-07-01T00:00:00Z",
  totalPriceSet: { shopMoney: { amount: "60.00", currencyCode: "USD" } },
  fulfillments: fulfillments.map((f, i) => ({
    id: `gid://shopify/Fulfillment/${id * 10 + i}`,
    createdAt: f.createdAt,
    deliveredAt: f.deliveredAt ?? null,
    displayStatus: f.displayStatus ?? "IN_TRANSIT",
  })),
});

const page = (nodes: unknown[]) => ({
  orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes },
});

const baseCtx = (graphql: RuleContext["graphql"]): RuleContext => ({
  shopId: "shop-uuid-1",
  shopDomain: "dev-store.myshopify.com",
  graphql,
  thresholds: { ...shippingDelayRule.defaultThresholds },
  now: NOW,
});

describe("shipping-delay rule", () => {
  it("flags shipments in transit past the threshold, skips delivered", async () => {
    const graphql = vi.fn().mockResolvedValue(page([
      orderNode(1, [{ createdAt: "2026-07-06T00:00:00Z" }]), // 10 days
      orderNode(2, [{
        createdAt: "2026-07-05T00:00:00Z",
        deliveredAt: "2026-07-08T00:00:00Z",
      }]),
      orderNode(3, [{ createdAt: "2026-07-14T00:00:00Z" }]), // 2 days
    ]));
    const detected = await shippingDelayRule.detect(baseCtx(graphql));
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      resourceId: "1",
      salientState: "transit:10",
      revenueAtRisk: 60,
    });
    expect(detected[0]!.details).toMatchObject({
      in_transit_days: 10,
      threshold_days: 7,
    });
  });

  it("skips terminal carrier statuses", async () => {
    const graphql = vi.fn().mockResolvedValue(page([
      orderNode(4, [{
        createdAt: "2026-07-01T00:00:00Z",
        displayStatus: "FAILURE",
      }]),
    ]));
    expect(await shippingDelayRule.detect(baseCtx(graphql))).toEqual([]);
  });
});
