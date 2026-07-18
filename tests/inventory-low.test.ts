import { describe, expect, it, vi } from "vitest";
import { inventoryLowRule } from "../supabase/functions/_shared/rules/inventory-low.ts";
import type { RuleContext } from "../supabase/functions/_shared/rules/types.ts";

const NOW = new Date("2026-07-16T12:00:00Z");

const variantNode = (
  id: number,
  qty: number,
  overrides: Record<string, unknown> = {},
) => ({
  id: `gid://shopify/ProductVariant/${id}`,
  title: "Default Title",
  sku: `SKU-${id}`,
  inventoryQuantity: qty,
  inventoryItem: { tracked: true },
  product: {
    id: `gid://shopify/Product/${id + 5000}`,
    title: `Product ${id}`,
    status: "ACTIVE",
  },
  ...overrides,
});

const page = (
  nodes: unknown[],
  hasNextPage = false,
  endCursor: string | null = null,
) => ({
  productVariants: { pageInfo: { hasNextPage, endCursor }, nodes },
});

const baseCtx = (
  graphql: RuleContext["graphql"],
  thresholds: Record<string, unknown> = {},
): RuleContext => ({
  shopId: "shop-uuid-1",
  shopDomain: "dev-store.myshopify.com",
  graphql,
  thresholds: { ...inventoryLowRule.defaultThresholds, ...thresholds },
  now: NOW,
});

describe("inventory-low rule", () => {
  it("flags oversold variants as high and out-of-stock as medium", async () => {
    const graphql = vi.fn().mockResolvedValue(
      page([variantNode(1, -2), variantNode(2, 0)]),
    );
    const detected = await inventoryLowRule.detect(baseCtx(graphql));
    expect(detected).toHaveLength(2);
    expect(detected[0]).toMatchObject({
      resourceType: "variant",
      resourceId: "1",
      severity: "high",
      salientState: "oversold",
    });
    expect(detected[0]!.details).toMatchObject({
      available: -2,
      product_id: "5001",
      sku: "SKU-1",
    });
    expect(detected[1]).toMatchObject({
      resourceId: "2",
      severity: "medium",
      salientState: "low:0",
    });
  });

  it("skips untracked inventory and non-active products", async () => {
    const graphql = vi.fn().mockResolvedValue(
      page([
        variantNode(3, 0, { inventoryItem: { tracked: false } }),
        variantNode(4, 0, {
          product: {
            id: "gid://shopify/Product/9",
            title: "Draft",
            status: "DRAFT",
          },
        }),
        variantNode(5, 0),
      ]),
    );
    const detected = await inventoryLowRule.detect(baseCtx(graphql));
    expect(detected.map((d) => d.resourceId)).toEqual(["5"]);
  });

  it("builds the search query from the threshold and re-checks quantities", async () => {
    const graphql = vi.fn().mockResolvedValue(
      page([variantNode(6, 10)]), // search over-returned; qty above threshold
    );
    const detected = await inventoryLowRule.detect(
      baseCtx(graphql, { low_stock_threshold: 5 }),
    );
    expect(detected).toEqual([]);
    const [, variables] = graphql.mock.calls[0]!;
    expect((variables as { q: string }).q).toBe("inventory_quantity:<=5");
  });

  it("walks pagination to the end", async () => {
    const graphql = vi.fn()
      .mockResolvedValueOnce(page([variantNode(7, 0)], true, "cur1"))
      .mockResolvedValueOnce(page([variantNode(8, -1)], false, null));
    const detected = await inventoryLowRule.detect(baseCtx(graphql));
    expect(detected).toHaveLength(2);
    expect((graphql.mock.calls[1]![1] as { cursor: string }).cursor).toBe(
      "cur1",
    );
  });
});
