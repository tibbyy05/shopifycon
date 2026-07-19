import { describe, expect, it, vi } from "vitest";
import { agingUnfulfilledRule } from "../supabase/functions/_shared/rules/aging-unfulfilled.ts";
import type { RuleContext } from "../supabase/functions/_shared/rules/types.ts";
import { idempotencyInput } from "../supabase/functions/_shared/rules/types.ts";

// Sample Shopify GraphQL payloads (shape matches Admin API orders query)
const NOW = new Date("2026-07-16T12:00:00Z");

const orderNode = (
  id: number,
  name: string,
  createdAt: string,
  fulfillment = "UNFULFILLED",
) => ({
  id: `gid://shopify/Order/${id}`,
  name,
  createdAt,
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: fulfillment,
  totalPriceSet: { shopMoney: { amount: "49.99", currencyCode: "USD" } },
});

const page = (
  nodes: unknown[],
  hasNextPage = false,
  endCursor: string | null = null,
) => ({
  orders: { pageInfo: { hasNextPage, endCursor }, nodes },
});

const baseCtx = (
  graphql: RuleContext["graphql"],
  thresholds: Record<string, unknown> = {},
): RuleContext => ({
  shopId: "shop-uuid-1",
  shopDomain: "dev-store.myshopify.com",
  graphql,
  thresholds: { ...agingUnfulfilledRule.defaultThresholds, ...thresholds },
  now: NOW,
});

describe("aging-unfulfilled rule", () => {
  it("flags a paid order older than the default 48h threshold", async () => {
    const graphql = vi.fn().mockResolvedValue(
      page([orderNode(1001, "#1001", "2026-07-13T09:00:00Z")]), // ~75h old
    );

    const detected = await agingUnfulfilledRule.detect(baseCtx(graphql));

    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      ruleId: "aging-unfulfilled",
      resourceType: "order",
      resourceId: "1001",
      severity: "high",
      salientState: "unfulfilled",
    });
    expect(detected[0]!.details).toMatchObject({
      order_name: "#1001",
      age_hours: 75,
      threshold_hours: 48,
    });
    expect(detected[0]!.revenueAtRisk).toBe(49.99);
  });

  it("builds the Shopify search query from the threshold and now()", async () => {
    const graphql = vi.fn().mockResolvedValue(page([]));
    await agingUnfulfilledRule.detect(baseCtx(graphql));

    const [, variables] = graphql.mock.calls[0]!;
    const q = (variables as { q: string }).q;
    expect(q).toContain("financial_status:paid");
    expect(q).toContain("fulfillment_status:unfulfilled");
    expect(q).toContain("status:open");
    // 48h before NOW
    expect(q).toContain("created_at:<'2026-07-14T12:00:00.000Z'");
  });

  it("respects a per-shop threshold override", async () => {
    // 10h-old order; shop threshold lowered to 6h
    const graphql = vi.fn().mockResolvedValue(
      page([orderNode(1002, "#1002", "2026-07-16T02:00:00Z")]),
    );
    const detected = await agingUnfulfilledRule.detect(
      baseCtx(graphql, { max_age_hours: 6 }),
    );
    expect(detected).toHaveLength(1);
    expect(detected[0]!.details.threshold_hours).toBe(6);
  });

  it("skips orders the search over-returned (fulfilled or too young)", async () => {
    const graphql = vi.fn().mockResolvedValue(
      page([
        orderNode(1003, "#1003", "2026-07-10T00:00:00Z", "FULFILLED"),
        orderNode(1004, "#1004", "2026-07-16T11:00:00Z"), // 1h old
        orderNode(1005, "#1005", "2026-07-12T00:00:00Z"), // genuinely aging
      ]),
    );
    const detected = await agingUnfulfilledRule.detect(baseCtx(graphql));
    expect(detected.map((d) => d.resourceId)).toEqual(["1005"]);
  });

  it("walks pagination to the end", async () => {
    const graphql = vi.fn()
      .mockResolvedValueOnce(
        page([orderNode(1, "#1", "2026-07-01T00:00:00Z")], true, "cur1"),
      )
      .mockResolvedValueOnce(
        page([orderNode(2, "#2", "2026-07-02T00:00:00Z")], false, null),
      );

    const detected = await agingUnfulfilledRule.detect(baseCtx(graphql));

    expect(detected).toHaveLength(2);
    expect(graphql).toHaveBeenCalledTimes(2);
    expect((graphql.mock.calls[1]![1] as { cursor: string }).cursor).toBe("cur1");
  });

  it("produces a stable idempotency input (dedupe across re-runs)", async () => {
    const graphql = vi.fn().mockResolvedValue(
      page([orderNode(1001, "#1001", "2026-07-13T09:00:00Z")]),
    );
    const [a] = await agingUnfulfilledRule.detect(baseCtx(graphql));
    const [b] = await agingUnfulfilledRule.detect(baseCtx(graphql));
    expect(idempotencyInput("shop-uuid-1", a!)).toBe(
      idempotencyInput("shop-uuid-1", b!),
    );
    expect(idempotencyInput("shop-uuid-1", a!)).toBe(
      "shop-uuid-1:aging-unfulfilled:1001:unfulfilled",
    );
  });
});
