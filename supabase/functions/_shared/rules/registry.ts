// All active rules. Adding an exception later = write the detector,
// add it to this array.

import type { ExceptionRule } from "./types.ts";
import { agingUnfulfilledRule } from "./aging-unfulfilled.ts";
import { orderFlowSilenceRule } from "./order-flow-silence.ts";
import { inventoryLowRule } from "./inventory-low.ts";
import { stuckFulfillmentRule } from "./stuck-fulfillment.ts";
import { paymentPendingRule } from "./payment-pending.ts";
import { shippingDelayRule } from "./shipping-delay.ts";
import { refundSpikeRule } from "./refund-spike.ts";
import { inventoryMismatchRule } from "./inventory-mismatch.ts";
import { discountSpikeRule } from "./discount-spike.ts";

export const RULES: ExceptionRule[] = [
  agingUnfulfilledRule,
  orderFlowSilenceRule,
  inventoryLowRule,
  stuckFulfillmentRule,
  paymentPendingRule,
  shippingDelayRule,
  refundSpikeRule,
  inventoryMismatchRule,
  discountSpikeRule,
];

export const scheduledRules = (): ExceptionRule[] =>
  RULES.filter((r) => r.trigger === "scheduled");

export const rulesForTopic = (topic: string): ExceptionRule[] =>
  RULES.filter(
    (r) => r.trigger === "webhook" && r.webhookTopics?.includes(topic),
  );
