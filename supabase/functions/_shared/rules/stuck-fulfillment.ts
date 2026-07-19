// Rule #4 — Stuck partial fulfillment.
// Paid, open orders that were PARTIALLY fulfilled and then stalled for
// longer than the threshold. Complements aging-unfulfilled (#1), which
// only catches orders where fulfillment never started.

import { gidToId } from "../shopify.ts";
import type {
  DetectedException,
  ExceptionRule,
  RuleContext,
} from "./types.ts";

const ORDERS_QUERY = /* GraphQL */ `
  query StuckPartial($q: String!, $cursor: String) {
    orders(first: 50, after: $cursor, query: $q, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet { shopMoney { amount currencyCode } }
      }
    }
  }
`;

interface OrderNode {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
}

export const stuckFulfillmentRule: ExceptionRule = {
  id: "stuck-fulfillment",
  name: "Stuck partial fulfillment",
  severity: "medium",
  trigger: "scheduled",
  schedule: "0 * * * *",
  defaultThresholds: { max_partial_age_hours: 24 },
  defaultAction: { type: "alert" },

  async detect(ctx: RuleContext): Promise<DetectedException[]> {
    const maxAgeHours = Number(ctx.thresholds.max_partial_age_hours ?? 24);
    const cutoff = new Date(ctx.now.getTime() - maxAgeHours * 3600 * 1000);
    const q = [
      "financial_status:paid",
      "fulfillment_status:partial",
      "status:open",
      `created_at:<'${cutoff.toISOString()}'`,
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
        // Re-check defensively — search indexing can lag order state.
        if (order.displayFulfillmentStatus !== "PARTIALLY_FULFILLED") continue;
        const ageHours = Math.floor(
          (ctx.now.getTime() - new Date(order.createdAt).getTime()) /
            3600_000,
        );
        if (ageHours < maxAgeHours) continue;

        const total = Number(order.totalPriceSet?.shopMoney?.amount);
        detected.push({
          ruleId: stuckFulfillmentRule.id,
          resourceType: "order",
          resourceId: gidToId(order.id),
          severity: stuckFulfillmentRule.severity,
          revenueAtRisk: Number.isFinite(total) ? total : null,
          salientState: "partial",
          details: {
            order_name: order.name,
            order_created_at: order.createdAt,
            age_hours: ageHours,
            threshold_hours: maxAgeHours,
            financial_status: order.displayFinancialStatus,
            fulfillment_status: order.displayFulfillmentStatus,
            total: order.totalPriceSet?.shopMoney ?? null,
          },
        });
      }

      cursor = orders.pageInfo.hasNextPage ? orders.pageInfo.endCursor : null;
    } while (cursor);

    return detected;
  },
};
