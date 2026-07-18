// Rule #1 — Aging unfulfilled order.
// Paid, not cancelled/closed, older than the threshold (default 48h),
// still unfulfilled. Runs on the hourly sweep.

import type {
  DetectedException,
  ExceptionRule,
  RuleContext,
} from "./types.ts";

const ORDERS_QUERY = /* GraphQL */ `
  query AgingUnfulfilled($q: String!, $cursor: String) {
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

function gidToId(gid: string): string {
  const m = gid.match(/\/(\d+)(\?.*)?$/);
  return m ? m[1] : gid;
}

export const agingUnfulfilledRule: ExceptionRule = {
  id: "aging-unfulfilled",
  name: "Aging unfulfilled order",
  severity: "high",
  trigger: "scheduled",
  schedule: "0 * * * *",
  defaultThresholds: { max_age_hours: 48 },
  defaultAction: { type: "alert" },

  async detect(ctx: RuleContext): Promise<DetectedException[]> {
    const maxAgeHours = Number(ctx.thresholds.max_age_hours ?? 48);
    const cutoff = new Date(ctx.now.getTime() - maxAgeHours * 3600 * 1000);
    const q = [
      "financial_status:paid",
      "fulfillment_status:unfulfilled",
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
        // The search query already filters, but re-check defensively —
        // search indexing can lag actual order state.
        if (order.displayFulfillmentStatus === "FULFILLED") continue;
        const ageHours = Math.floor(
          (ctx.now.getTime() - new Date(order.createdAt).getTime()) /
            3600_000,
        );
        if (ageHours < maxAgeHours) continue;

        detected.push({
          ruleId: agingUnfulfilledRule.id,
          resourceType: "order",
          resourceId: gidToId(order.id),
          severity: agingUnfulfilledRule.severity,
          salientState: "unfulfilled",
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
