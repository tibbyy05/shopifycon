import { describe, expect, it, vi } from "vitest";
import { inventoryMismatchRule } from "../supabase/functions/_shared/rules/inventory-mismatch.ts";
import type { RuleContext } from "../supabase/functions/_shared/rules/types.ts";

const NOW = new Date("2026-07-16T12:00:00Z");

const variantNode = (
  id: number,
  levels: { available: number; committed: number }[],
  overrides: Record<string, unknown> = {},
) => ({
  id: `gid://shopify/ProductVariant/${id}`,
  title: "Default Title",
  sku: `SKU-${id}`,
  price: "25.00",
  product: {
    id: `gid://shopify/Product/${id + 5000}`,
    title: `Product ${id}`,
    status: "ACTIVE",
  },
  inventoryItem: {
    tracked: true,
    inventoryLevels: {
      nodes: levels.map((l, i) => ({
        id: `gid://shopify/InventoryLevel/${i + 1}?inventory_item_id=9`,
        quantities: [
          { name: "available", quantity: l.available },
          { name: "committed", quantity: l.committed },
        ],
      })),
    },
  },
  ...overrides,
});

const page = (nodes: unknown[]) => ({
  productVariants: { pageInfo: { hasNextPage: false, endCursor: null }, nodes },
});

const baseCtx = (graphql: RuleContext["graphql"]): RuleContext => ({
  shopId: "shop-uuid-1",
  shopDomain: "dev-store.myshopify.com",
  graphql,
  thresholds: {},
  now: NOW,
});

describe("inventory-mismatch rule", () => {
  it("flags locations where committed exceeds available", async () => {
    const graphql = vi.fn().mockResolvedValue(page([
      variantNode(1, [{ available: 2, committed: 5 }]), // shortfall 3
      variantNode(2, [{ available: 10, committed: 4 }]), // fine
    ]));
    const detected = await inventoryMismatchRule.detect(baseCtx(graphql));
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      resourceId: "1",
      severity: "high",
      salientState: "mismatch:1",
      revenueAtRisk: 75, // $25 × 3 unshippable units
    });
    expect(detected[0]!.details).toMatchObject({
      committed: 5,
      available: 2,
      shortfall_units: 3,
    });
  });

  it("skips untracked items and zero-committed levels", async () => {
    const graphql = vi.fn().mockResolvedValue(page([
      variantNode(3, [{ available: -2, committed: 0 }]),
      variantNode(4, [{ available: 0, committed: 3 }], {
        inventoryItem: { tracked: false, inventoryLevels: { nodes: [] } },
      }),
    ]));
    expect(await inventoryMismatchRule.detect(baseCtx(graphql))).toEqual([]);
  });
});
