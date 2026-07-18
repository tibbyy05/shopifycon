import { describe, expect, it, vi } from "vitest";
import {
  type ExceptionInsert,
  type ExceptionStore,
  persistDetections,
} from "../supabase/functions/_shared/rules/engine.ts";
import { agingUnfulfilledRule } from "../supabase/functions/_shared/rules/aging-unfulfilled.ts";
import type { DetectedException } from "../supabase/functions/_shared/rules/types.ts";
import { sha256Hex } from "../supabase/functions/_shared/crypto.ts";

const detection = (resourceId: string): DetectedException => ({
  ruleId: "aging-unfulfilled",
  resourceType: "order",
  resourceId,
  severity: "high",
  salientState: "unfulfilled",
  details: { order_name: `#${resourceId}` },
});

function fakeStore(existingKeys: Set<string> = new Set()) {
  const inserted: ExceptionInsert[] = [];
  const store: ExceptionStore = {
    insertNew: vi.fn(async (rows: ExceptionInsert[]) => {
      const fresh = rows.filter((r) => !existingKeys.has(r.idempotency_key));
      fresh.forEach((r) => {
        existingKeys.add(r.idempotency_key);
        inserted.push(r);
      });
      return fresh.map((r, i) => ({
        id: `exc-${i}-${r.resource_id}`,
        idempotency_key: r.idempotency_key,
      }));
    }),
    resolveMissing: vi.fn(async () => 0),
  };
  return { store, inserted, existingKeys };
}

describe("persistDetections", () => {
  it("opens new exceptions and reports them for alert dispatch", async () => {
    const { store } = fakeStore();
    const result = await persistDetections(
      store,
      "shop-1",
      agingUnfulfilledRule,
      [detection("100"), detection("200")],
      sha256Hex,
    );

    expect(result.detected).toBe(2);
    expect(result.opened).toHaveLength(2);
    expect(result.opened[0]!.exception).toMatchObject({
      shop_id: "shop-1",
      rule_id: "aging-unfulfilled",
      resource_id: "100",
      severity: "high",
    });
  });

  it("is idempotent — re-running the same detections opens nothing new", async () => {
    const { store, existingKeys } = fakeStore();
    await persistDetections(
      store,
      "shop-1",
      agingUnfulfilledRule,
      [detection("100")],
      sha256Hex,
    );
    expect(existingKeys.size).toBe(1);

    const second = await persistDetections(
      store,
      "shop-1",
      agingUnfulfilledRule,
      [detection("100")],
      sha256Hex,
    );
    expect(second.detected).toBe(1);
    expect(second.opened).toHaveLength(0); // no duplicate exception
  });

  it("same resource in a different shop gets a different key", async () => {
    const { store, existingKeys } = fakeStore();
    await persistDetections(store, "shop-1", agingUnfulfilledRule, [
      detection("100"),
    ], sha256Hex);
    const other = await persistDetections(store, "shop-2", agingUnfulfilledRule, [
      detection("100"),
    ], sha256Hex);
    expect(other.opened).toHaveLength(1);
    expect(existingKeys.size).toBe(2);
  });

  it("asks the store to resolve exceptions no longer detected", async () => {
    const { store } = fakeStore();
    await persistDetections(
      store,
      "shop-1",
      agingUnfulfilledRule,
      [detection("100")],
      sha256Hex,
    );
    expect(store.resolveMissing).toHaveBeenCalledWith(
      "shop-1",
      "aging-unfulfilled",
      [await sha256Hex("shop-1:aging-unfulfilled:100:unfulfilled")],
    );
  });
});
