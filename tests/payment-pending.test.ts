import { describe, expect, it, vi } from "vitest";
import { paymentPendingRule } from "../supabase/functions/_shared/rules/payment-pending.ts";
import type { RuleContext } from "../supabase/functions/_shared/rules/types.ts";

const NOW = new Date("2026-07-16T12:00:00Z");

const orderNode = (id: number, createdAt: string, status: string) => ({
  id: `gid://shopify/Order/${id}`,
  name: `#${id}`,
  createdAt,
  displayFinancialStatus: status,
  totalPriceSet: { shopMoney: { amount: "150.00", currencyCode: "USD" } },
});

const page = (nodes: unknown[]) => ({
  orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes },
});

const baseCtx = (graphql: RuleContext["graphql"]): RuleContext => ({
  shopId: "shop-uuid-1",
  shopDomain: "dev-store.myshopify.com",
  graphql,
  thresholds: { ...paymentPendingRule.defaultThresholds },
  now: NOW,
});

describe("payment-pending rule", () => {
  it("flags aging pending payments and expired auths", async () => {
    const graphql = vi.fn().mockResolvedValue(page([
      orderNode(1, "2026-07-15T06:00:00Z", "PENDING"), // 30h pending
      orderNode(2, "2026-07-16T10:00:00Z", "EXPIRED"), // young but expired
      orderNode(3, "2026-07-16T11:00:00Z", "AUTHORIZED"), // 1h — too young
    ]));
    const detected = await paymentPendingRule.detect(baseCtx(graphql));
    expect(detected.map((d) => [d.resourceId, d.severity, d.salientState]))
      .toEqual([
        ["1", "medium", "pending"],
        ["2", "high", "expired"],
      ]);
    expect(detected[0]!.revenueAtRisk).toBe(150);
  });

  it("stays quiet when payments are fresh and none expired", async () => {
    const graphql = vi.fn().mockResolvedValue(page([
      orderNode(4, "2026-07-16T09:00:00Z", "PENDING"), // 3h
    ]));
    expect(await paymentPendingRule.detect(baseCtx(graphql))).toEqual([]);
  });
});
