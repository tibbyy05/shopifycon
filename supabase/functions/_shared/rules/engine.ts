// Persists detected exceptions idempotently and reports which ones are
// NEW (so callers can dispatch alerts exactly once). Storage-agnostic:
// takes a minimal client interface so tests can stub it.

import type { DetectedException, ExceptionRule } from "./types.ts";
import { idempotencyInput } from "./types.ts";

export interface ExceptionStore {
  /** Insert rows, ignoring idempotency_key conflicts; return inserted rows. */
  insertNew(
    rows: ExceptionInsert[],
  ): Promise<{ id: string; idempotency_key: string }[]>;
  /**
   * Mark open/ack exceptions for (shopId, ruleId) whose idempotency_key is
   * NOT in `activeKeys` as resolved. Returns count resolved.
   */
  resolveMissing(
    shopId: string,
    ruleId: string,
    activeKeys: string[],
  ): Promise<number>;
}

export interface ExceptionInsert {
  shop_id: string;
  rule_id: string;
  resource_type: string;
  resource_id: string;
  severity: string;
  details: Record<string, unknown>;
  revenue_at_risk: number | null;
  idempotency_key: string;
}

export interface EngineResult {
  detected: number;
  opened: { id: string; exception: ExceptionInsert }[];
  resolved: number;
}

export async function persistDetections(
  store: ExceptionStore,
  shopId: string,
  rule: ExceptionRule,
  detections: DetectedException[],
  hash: (input: string) => Promise<string>,
  opts: { resolveMissing: boolean } = { resolveMissing: true },
): Promise<EngineResult> {
  const rows: ExceptionInsert[] = [];
  for (const d of detections) {
    rows.push({
      shop_id: shopId,
      rule_id: d.ruleId,
      resource_type: d.resourceType,
      resource_id: d.resourceId,
      severity: d.severity,
      details: d.details,
      revenue_at_risk: d.revenueAtRisk ?? null,
      idempotency_key: await hash(idempotencyInput(shopId, d)),
    });
  }

  const inserted = rows.length ? await store.insertNew(rows) : [];
  const byKey = new Map(rows.map((r) => [r.idempotency_key, r]));
  const opened = inserted.map((i) => ({
    id: i.id,
    exception: byKey.get(i.idempotency_key)!,
  }));

  // Scheduled rules see the full current state, so anything previously
  // open that is no longer detected has healed — close it.
  const resolved = opts.resolveMissing
    ? await store.resolveMissing(
      shopId,
      rule.id,
      rows.map((r) => r.idempotency_key),
    )
    : 0;

  return { detected: rows.length, opened, resolved };
}
