// Rule #5 — Payment pending or expired.
// Open orders whose payment never completed: pending/authorized past the
// age threshold (auth windows expire — capture before it's gone), or
// already EXPIRED (revenue lost unless re-charged).

import { gidToId } from "../shopify.ts";
import type {
  DetectedException,
  ExceptionRule,
  RuleContext,
} from "./types.ts";

const ORDERS_QUERY = /* GraphQL */ `
  query PendingPayments($q: String!, $cursor: String) {
    orders(first: 50, after: $cursor, query: $q, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        displayFinancialStatus
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
  totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
}

export const paymentPendingRule: ExceptionRule = {
  id: "payment-pending",
  name: "Payment pending or expired",
  severity: "high",
  trigger: "scheduled",
  schedule: "0 * * * *",
  defaultThresholds: { max_payment_pending_hours: 24 },
  defaultAction: { type: "alert" },

  async detect(ctx: RuleContext): Promise<DetectedException[]> {
    const maxAgeHours = Number(ctx.thresholds.max_payment_pending_hours ?? 24);
    const q = [
      "(financial_status:pending OR financial_status:authorized OR financial_status:expired)",
      "status:open",
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
        const status = order.displayFinancialStatus;
        const expired = status === "EXPIRED";
        const ageHours = Math.floor(
          (ctx.now.getTime() - new Date(order.createdAt).getTime()) /
            3600_000,
        );
        if (!expired && ageHours < maxAgeHours) continue;
        if (!["PENDING", "AUTHORIZED", "EXPIRED"].includes(status)) continue;

        const total = Number(order.totalPriceSet?.shopMoney?.amount);
        detected.push({
          ruleId: paymentPendingRule.id,
          resourceType: "order",
          resourceId: gidToId(order.id),
          severity: expired ? "high" : "medium",
          revenueAtRisk: Number.isFinite(total) ? total : null,
          salientState: expired ? "expired" : "pending",
          details: {
            order_name: order.name,
            order_created_at: order.createdAt,
            age_hours: ageHours,
            threshold_hours: maxAgeHours,
            financial_status: status,
            total: order.totalPriceSet?.shopMoney ?? null,
          },
        });
      }

      cursor = orders.pageInfo.hasNextPage ? orders.pageInfo.endCursor : null;
    } while (cursor);

    return detected;
  },
};
