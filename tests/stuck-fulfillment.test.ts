import { describe, expect, it, vi } from "vitest";
import { stuckFulfillmentRule } from "../supabase/functions/_shared/rules/stuck-fulfillment.ts";
import type { RuleContext } from "../supabase/functions/_shared/rules/types.ts";

const NOW = new Date("2026-07-16T12:00:00Z");

const orderNode = (
  id: number,
  createdAt: string,
  fulfillment = "PARTIALLY_FULFILLED",
) => ({
  id: `gid://shopify/Order/${id}`,
  name: `#${id}`,
  createdAt,
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: fulfillment,
  totalPriceSet: { shopMoney: { amount: "80.00", currencyCode: "USD" } },
});

const page = (nodes: unknown[]) => ({
  orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes },
});

const baseCtx = (
  graphql: RuleContext["graphql"],
  thresholds: Record<string, unknown> = {},
): RuleContext => ({
  shopId: "shop-uuid-1",
  shopDomain: "dev-store.myshopify.com",
  graphql,
  thresholds: { ...stuckFulfillmentRule.defaultThresholds, ...thresholds },
  now: NOW,
});

describe("stuck-fulfillment rule", () => {
  it("flags partially fulfilled orders older than the threshold", async () => {
    const graphql = vi.fn().mockResolvedValue(
      page([orderNode(2001, "2026-07-14T06:00:00Z")]), // 54h old
    );
    const detected = await stuckFulfillmentRule.detect(baseCtx(graphql));
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      ruleId: "stuck-fulfillment",
      resourceId: "2001",
      severity: "medium",
      salientState: "partial",
    });
    expect(detected[0]!.details).toMatchObject({
      age_hours: 54,
      threshold_hours: 24,
    });
  });

  it("queries for partial fulfillment with the cutoff", async () => {
    const graphql = vi.fn().mockResolvedValue(page([]));
    await stuckFulfillmentRule.detect(baseCtx(graphql));
    const q = (graphql.mock.calls[0]![1] as { q: string }).q;
    expect(q).toContain("fulfillment_status:partial");
    expect(q).toContain("created_at:<'2026-07-15T12:00:00.000Z'");
  });

  it("skips orders whose live state is not partially fulfilled", async () => {
    const graphql = vi.fn().mockResolvedValue(
      page([
        orderNode(2002, "2026-07-13T00:00:00Z", "FULFILLED"),
        orderNode(2003, "2026-07-16T11:00:00Z"), // 1h old
        orderNode(2004, "2026-07-13T00:00:00Z"),
      ]),
    );
    const detected = await stuckFulfillmentRule.detect(baseCtx(graphql));
    expect(detected.map((d) => d.resourceId)).toEqual(["2004"]);
  });
});
