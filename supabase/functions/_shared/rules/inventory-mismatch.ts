// Rule #8 — Committed inventory exceeds available stock.
// At some location, more units are committed to open orders than the
// location actually has. Those are promised sales that physically can't
// ship — refunds waiting to happen unless stock moves.

import { gidToId } from "../shopify.ts";
import type {
  DetectedException,
  ExceptionRule,
  RuleContext,
} from "./types.ts";

// Small page sizes: nested inventoryLevels + quantities are expensive in
// Shopify's query-cost model — 100×10 blows the 1000-point budget.
const VARIANTS_QUERY = /* GraphQL */ `
  query CommittedMismatch($cursor: String) {
    productVariants(first: 25, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        sku
        price
        product { id title status }
        inventoryItem {
          tracked
          inventoryLevels(first: 5) {
            nodes {
              id
              quantities(names: ["available", "committed"]) {
                name
                quantity
              }
            }
          }
        }
      }
    }
  }
`;

// Full-catalog scan; cap pages so huge catalogs can't stall the sweep.
const MAX_PAGES = 8;

// Location names need the read_locations scope (not granted) — key on
// the inventory level id instead.
interface LevelNode {
  id: string;
  quantities: { name: string; quantity: number }[];
}

interface VariantNode {
  id: string;
  title: string;
  sku: string | null;
  price: string | null;
  product: { id: string; title: string; status: string };
  inventoryItem: {
    tracked: boolean;
    inventoryLevels: { nodes: LevelNode[] };
  } | null;
}

export const inventoryMismatchRule: ExceptionRule = {
  id: "inventory-mismatch",
  name: "Committed exceeds available stock",
  severity: "high",
  trigger: "scheduled",
  schedule: "0 * * * *",
  defaultThresholds: {},
  defaultAction: { type: "alert" },

  async detect(ctx: RuleContext): Promise<DetectedException[]> {
    const detected: DetectedException[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const data = await ctx.graphql(VARIANTS_QUERY, { cursor });
      const variants = data.productVariants as {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: VariantNode[];
      };
      pages++;

      for (const v of variants.nodes) {
        if (!v.inventoryItem?.tracked) continue;
        if (v.product.status !== "ACTIVE") continue;

        for (const level of v.inventoryItem.inventoryLevels?.nodes ?? []) {
          const get = (name: string) =>
            level.quantities.find((x) => x.name === name)?.quantity ?? 0;
          const available = get("available");
          const committed = get("committed");
          if (committed <= available || committed <= 0) continue;

          const shortfall = committed - available;
          const price = Number(v.price);
          detected.push({
            ruleId: inventoryMismatchRule.id,
            resourceType: "variant",
            resourceId: gidToId(v.id),
            severity: inventoryMismatchRule.severity,
            revenueAtRisk: Number.isFinite(price) && price > 0
              ? Math.round(price * shortfall * 100) / 100
              : null,
            salientState: `mismatch:${gidToId(level.id)}`,
            details: {
              product_id: gidToId(v.product.id),
              product_title: v.product.title,
              variant_title: v.title,
              sku: v.sku || null,
              committed,
              available,
              shortfall_units: shortfall,
              variant_price: Number.isFinite(price) ? price : null,
            },
          });
        }
      }

      cursor = variants.pageInfo.hasNextPage
        ? variants.pageInfo.endCursor
        : null;
    } while (cursor && pages < MAX_PAGES);

    return detected;
  },
};
