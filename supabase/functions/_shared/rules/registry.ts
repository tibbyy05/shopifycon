// All active rules. Adding an exception later = write the detector,
// add it to this array.

import type { ExceptionRule } from "./types.ts";
import { agingUnfulfilledRule } from "./aging-unfulfilled.ts";

export const RULES: ExceptionRule[] = [
  agingUnfulfilledRule,
];

export const scheduledRules = (): ExceptionRule[] =>
  RULES.filter((r) => r.trigger === "scheduled");

export const rulesForTopic = (topic: string): ExceptionRule[] =>
  RULES.filter(
    (r) => r.trigger === "webhook" && r.webhookTopics?.includes(topic),
  );
