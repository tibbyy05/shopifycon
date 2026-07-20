// Rule #6 — Shipment stuck in transit.
// A fulfillment shipped more than the threshold days ago and still shows
// no delivery. Catches lost packages and carrier stalls before the
// customer opens a "where is my order" ticket (or a chargeback).

import { gidToId } from "../shopify.ts";
import type {
  DetectedException,
  ExceptionRule,
  RuleContext,
} from "./types.ts";

const ORDERS_QUERY = /* GraphQL */ `
  query ShippingDelays($q: String!, $cursor: String) {
    orders(first: 50, after: $cursor, query: $q, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        totalPriceSet { shopMoney { amount currencyCode } }
        fulfillments {
          id
          createdAt
          deliveredAt
          displayStatus
        }
      }
    }
  }
`;

interface FulfillmentNode {
  id: string;
  createdAt: string;
  deliveredAt: string | null;
  displayStatus: string | null;
}

interface OrderNode {
  id: string;
  name: string;
  createdAt: string;
  totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
  fulfillments: FulfillmentNode[];
}

const DONE_STATUSES = ["DELIVERED", "CANCELED", "FAILURE"];

export const shippingDelayRule: ExceptionRule = {
  id: "shipping-delay",
  name: "Shipment stuck in transit",
  severity: "medium",
  trigger: "scheduled",
  schedule: "0 * * * *",
  defaultThresholds: { max_transit_days: 7 },
  defaultAction: { type: "alert" },

  async detect(ctx: RuleContext): Promise<DetectedException[]> {
    const maxDays = Number(ctx.thresholds.max_transit_days ?? 7);
    // Only scan orders young enough to plausibly still be in transit.
    const floor = new Date(ctx.now.getTime() - 60 * 24 * 3600_000);
    const q = [
      "fulfillment_status:shipped",
      `created_at:>='${floor.toISOString()}'`,
    ].join(" AND ");

    const detected: DetectedException[] = [];
    let cursor: string | null = null;

    do {
      const data = await ctx.graphql(ORDERS_QUERY, { q, cursor });
      const orders = data.orders as {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: OrderNode[];
      };

      for (const order of orders.nodes) {
        for (const f of order.fulfillments ?? []) {
          if (f.deliveredAt) continue;
          if (f.displayStatus && DONE_STATUSES.includes(f.displayStatus)) {
            continue;
          }
          const transitDays = Math.floor(
            (ctx.now.getTime() - new Date(f.createdAt).getTime()) /
              (24 * 3600_000),
          );
          if (transitDays < maxDays) continue;

          const total = Number(order.totalPriceSet?.shopMoney?.amount);
          detected.push({
            ruleId: shippingDelayRule.id,
            resourceType: "order",
            resourceId: gidToId(order.id),
            severity: shippingDelayRule.severity,
            revenueAtRisk: Number.isFinite(total) ? total : null,
            salientState: `transit:${gidToId(f.id)}`,
            details: {
              order_name: order.name,
              shipped_at: f.createdAt,
              in_transit_days: transitDays,
              threshold_days: maxDays,
              carrier_status: f.displayStatus ?? "UNKNOWN",
              total: order.totalPriceSet?.shopMoney ?? null,
            },
          });
          break; // one exception per order is enough
        }
      }

      cursor = orders.pageInfo.hasNextPage ? orders.pageInfo.endCursor : null;
    } while (cursor);

    return detected;
  },
};
