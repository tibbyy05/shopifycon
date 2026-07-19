-- Revenue at risk: estimated dollars exposed by each exception, computed
-- by the detecting rule. Null when a rule can't estimate.

alter table public.exceptions add column revenue_at_risk numeric;
