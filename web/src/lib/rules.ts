// Human-readable names for rule ids. Mirror supabase/functions/_shared/
// rules/registry.ts when adding a rule.

const RULE_LABELS: Record<string, string> = {
  "aging-unfulfilled": "Aging unfulfilled order",
};

export const ruleLabel = (id: string): string => RULE_LABELS[id] ?? id;
