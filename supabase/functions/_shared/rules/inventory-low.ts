// Rule #3 — Inventory at or below threshold on active products.
// A negative quantity means the store oversold (high severity); zero or
// a low positive quantity means the product can no longer sell (medium).
// Untracked inventory and non-active products are skipped.

import { gidToId } from "../shopify.ts";
import type {
  DetectedException,
  ExceptionRule,
  RuleContext,
} from "./types.ts";

const VARIANTS_QUERY = /* GraphQL */ `
  query LowInventory($q: String!, $cursor: String) {
    productVariants(first: 100, after: $cursor, query: $q) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        sku
        price
        inventoryQuantity
        inventoryItem { tracked }
        product { id title status }
      }
    }
  }
`;

interface VariantNode {
  id: string;
  title: string;
  sku: string | null;
  price: string | null;
  inventoryQuantity: number | null;
  inventoryItem: { tracked: boolean } | null;
  product: { id: string; title: string; status: string };
}

export const inventoryLowRule: ExceptionRule = {
  id: "inventory-low",
  name: "Inventory low or oversold",
  severity: "high",
  trigger: "scheduled",
  schedule: "0 * * * *",
  defaultThresholds: { low_stock_threshold: 0 },
  defaultAction: { type: "alert" },

  async detect(ctx: RuleContext): Promise<DetectedException[]> {
    const threshold = Number(ctx.thresholds.low_stock_threshold ?? 0);
    const q = `inventory_quantity:<=${threshold}`;

    const detected: DetectedException[] = [];
    let cursor: string | null = null;

    do {
      const data = await ctx.graphql(VARIANTS_QUERY, { q, cursor });
      const variants = data.productVariants as {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: VariantNode[];
      };

      for (const v of variants.nodes) {
        if (!v.inventoryItem?.tracked) continue;
        if (v.product.status !== "ACTIVE") continue;
        const qty = v.inventoryQuantity ?? 0;
        if (qty > threshold) continue; // search index can lag

        const oversold = qty < 0;
        // Oversold: refund exposure on already-sold units. Otherwise: at
        // least one lost sale while the variant can't sell.
        const price = Number(v.price);
        const atRisk = Number.isFinite(price) && price > 0
          ? price * Math.max(1, -qty)
          : null;
        detected.push({
          ruleId: inventoryLowRule.id,
          resourceType: "variant",
          resourceId: gidToId(v.id),
          severity: oversold ? "high" : "medium",
          revenueAtRisk: atRisk,
          salientState: oversold ? "oversold" : `low:${threshold}`,
          details: {
            product_id: gidToId(v.product.id),
            product_title: v.product.title,
            variant_title: v.title,
            sku: v.sku || null,
            variant_price: Number.isFinite(price) ? price : null,
            available: qty,
            threshold,
          },
        });
      }

      cursor = variants.pageInfo.hasNextPage
        ? variants.pageInfo.endCursor
        : null;
    } while (cursor);

    return detected;
  },
};
