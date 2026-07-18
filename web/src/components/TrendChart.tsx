import { useState } from "react";

const DAY_MS = 86_400_000;
const DAYS = 14;

interface Bucket {
  label: string;
  count: number;
}

// New exceptions per day, last 14 days. Single series (no legend); the
// card title names it. Bar color #2563eb is palette-validated against
// the light surface.
export function TrendChart({
  exceptions,
  nowMs,
}: {
  exceptions: { first_seen_at: string }[];
  nowMs: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const buckets: Bucket[] = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today.getTime() - (DAYS - 1 - i) * DAY_MS);
    return {
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: 0,
    };
  });
  for (const e of exceptions) {
    const d = new Date(e.first_seen_at);
    d.setHours(0, 0, 0, 0);
    const idx = DAYS - 1 - Math.round((today.getTime() - d.getTime()) / DAY_MS);
    if (idx >= 0 && idx < DAYS) buckets[idx].count++;
  }

  const max = Math.max(...buckets.map((b) => b.count));
  const total = buckets.reduce((n, b) => n + b.count, 0);

  return (
    <div>
      <div className="relative h-40">
        {/* Recessive gridlines: max and midpoint. */}
        {max > 0 && (
          <>
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-200">
              <span className="absolute -top-2 right-0 text-[10px] text-slate-400">
                {max}
              </span>
            </div>
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100" />
          </>
        )}
        <div className="absolute inset-x-0 bottom-0 border-t border-slate-200" />

        <div className="absolute inset-0 flex items-end gap-[2px]">
          {buckets.map((b, i) => (
            <div
              key={i}
              className="relative flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && (
                <div className="pointer-events-none absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white shadow">
                  {b.label} · {b.count} new
                </div>
              )}
              <div
                className="w-full max-w-6 rounded-t"
                style={{
                  height: b.count ? `${(b.count / max) * 100}%` : "2px",
                  minHeight: b.count ? "4px" : undefined,
                  backgroundColor:
                    b.count === 0
                      ? "#e2e8f0"
                      : hover === i
                        ? "#1d4ed8"
                        : "#2563eb",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{buckets[0].label}</span>
        <span>{buckets[DAYS - 1].label}</span>
      </div>

      {total === 0 && (
        <p className="mt-3 text-center text-sm text-slate-400">
          No new exceptions in the last {DAYS} days.
        </p>
      )}
    </div>
  );
}
