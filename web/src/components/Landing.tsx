import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { BRAND_NAME } from "../lib/brand";
import { RULE_META } from "../lib/rules";
import dashboardShot from "../assets/dashboard.jpg";

function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#16161e" />
      <circle cx="13" cy="16" r="4" fill="#ff5c00" />
      <path
        d="M20 9a9.9 9.9 0 0 1 0 14"
        stroke="#ff5c00"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M23.5 5.5a14.8 14.8 0 0 1 0 21"
        stroke="#ff5c00"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
        opacity="0.45"
      />
    </svg>
  );
}

/* Scroll-triggered reveal. */
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(26px)",
        filter: shown ? "none" : "blur(4px)",
        transition: `opacity 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s, filter 0.8s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

const SEVERITY_DARK: Record<string, string> = {
  high: "bg-red-500/15 text-red-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-zinc-500/15 text-zinc-400",
};

const RULE_GLOW: Record<string, string> = {
  high: "hover:shadow-[0_0_40px_rgba(239,68,68,0.12)] hover:border-red-500/30",
  medium:
    "hover:shadow-[0_0_40px_rgba(245,158,11,0.12)] hover:border-amber-500/30",
  low: "hover:shadow-[0_0_40px_rgba(161,161,170,0.1)] hover:border-zinc-500/30",
};

const RULE_ICONS: Record<string, React.ReactNode> = {
  "aging-unfulfilled": (
    <path d="M12 7v5l3.5 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  ),
  "order-flow-silence": (
    <path d="M3 12h4l2-7 4 14 2-7h6M3 3l18 18" />
  ),
  "inventory-low": (
    <path d="m21 8-9-5-9 5v8l9 5 9-5V8ZM3.3 8.3 12 13l8.7-4.7M12 13v9" />
  ),
  "stuck-fulfillment": (
    <path d="M14 17h-9V5h9v12Zm0-8h4l3 3v5h-7M7.5 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
  ),
};

/* Illustrative alerts cycling in the hero — sample content. */
const SAMPLE_ALERTS: { sev: "high" | "medium"; title: string; detail: string }[] = [
  { sev: "high", title: "Aging unfulfilled order", detail: "#1042 · paid 52h ago, never shipped" },
  { sev: "high", title: "Order flow silence", detail: "no orders for 26h — checkout suspect" },
  { sev: "medium", title: "Inventory low", detail: "Alpine Jacket / M · 0 left, still listed" },
  { sev: "high", title: "Inventory oversold", detail: "Trail Mix 3-pack · -2 available" },
];

function AlertTicker() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setIdx((i) => (i + 1) % SAMPLE_ALERTS.length),
      3600,
    );
    return () => clearInterval(t);
  }, []);

  const a = SAMPLE_ALERTS[idx];
  return (
    <div
      key={idx}
      className="animate-ticker pointer-events-none flex items-center gap-3 rounded-xl border border-white/10 bg-ink-800/95 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur"
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          a.sev === "high" ? "bg-red-500" : "bg-amber-400"
        }`}
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-100">{a.title}</p>
        <p className="truncate text-xs text-zinc-400">{a.detail}</p>
      </div>
      <span className="ml-2 shrink-0 rounded-md bg-signal-500/15 px-2 py-1 text-xs font-medium text-signal-400">
        alerted
      </span>
    </div>
  );
}

interface Health {
  ok: boolean;
  age_minutes: number | null;
  shops_processed: number;
}

function StatusStrip() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sweep-health`;
    fetch(url)
      .then((r) => r.json())
      .then((h: Health) => setHealth(h))
      .catch(() => setHealth(null));
  }, []);

  if (!health?.ok) return null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-ink-900/80 px-4 py-1.5 text-sm text-zinc-400 backdrop-blur">
      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-dot" />
      Monitoring live · {health.shops_processed}{" "}
      {health.shops_processed === 1 ? "store" : "stores"} watched · last sweep{" "}
      {health.age_minutes === 0 ? "moments" : `${health.age_minutes}m`} ago
    </div>
  );
}

function SignupForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
        Check your inbox — we sent a sign-in link to {email}.
      </p>
    );
  }

  return (
    <form
      onSubmit={submit}
      id="signin"
      className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="flex-1 rounded-lg border border-ink-700 bg-ink-800/80 px-4 py-3 text-sm text-zinc-100 backdrop-blur transition-colors placeholder:text-zinc-500 focus:border-signal-500 focus:outline-none focus:ring-2 focus:ring-signal-500/20"
      />
      <button
        type="submit"
        disabled={busy}
        className="btn-shine group rounded-lg bg-gradient-to-b from-signal-400 to-signal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-signal-500/25 transition-all hover:shadow-signal-500/40 disabled:opacity-50"
      >
        {busy ? "Sending…" : (
          <span className="flex items-center gap-1.5">
            Start monitoring free
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        )}
      </button>
      {error && <p className="text-sm text-red-400 sm:w-full">{error}</p>}
    </form>
  );
}

const STEPS: [string, string][] = [
  [
    "Connect your store",
    "One-click OAuth install with read-only scopes. We can see problems — we can never touch your store.",
  ],
  [
    "Rules watch, around the clock",
    "Every hour, every rule sweeps your live orders and inventory. Thresholds are yours to tune, per store.",
  ],
  [
    "Get alerted before customers notice",
    "Email or Slack, the moment something opens — with a deep link straight to the order in your Shopify admin.",
  ],
];

export function Landing() {
  return (
    <div className="min-h-screen bg-ink-950 font-sans text-zinc-100 antialiased">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2.5 font-display text-base font-semibold tracking-tight">
            <Mark />
            {BRAND_NAME}
          </span>
          <a
            href="#signin"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition-all hover:border-signal-500/60 hover:bg-signal-500/10 hover:text-white"
          >
            Sign in
          </a>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="grain relative overflow-hidden">
          {/* Ambience: drifting orbs + dot grid */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="dotgrid absolute inset-0" />
            <div className="animate-drift-a absolute left-[12%] top-[-10%] h-96 w-96 rounded-full bg-signal-500/15 blur-3xl" />
            <div className="animate-drift-b absolute right-[8%] top-[15%] h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
            <div className="absolute inset-x-0 top-[-20%] h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(255,92,0,0.16),transparent_65%)]" />
          </div>

          <div className="relative mx-auto max-w-6xl px-6 pb-14 pt-20 text-center lg:pt-28">
            <div className="animate-rise mb-6 flex justify-center">
              <StatusStrip />
            </div>
            <h1 className="animate-rise mx-auto max-w-3xl font-display text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl"
              style={{ animationDelay: "0.08s" }}
            >
              Your Shopify store breaks quietly.{" "}
              <span className="text-glow">We make it loud.</span>
            </h1>
            <p
              className="animate-rise mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400"
              style={{ animationDelay: "0.16s" }}
            >
              Paid orders that never ship. Checkouts that stop converting at
              2am. Products overselling to negative stock. Caught every hour —
              alerted before a customer ever emails.
            </p>
            <div
              className="animate-rise mx-auto mt-9 flex justify-center"
              style={{ animationDelay: "0.24s" }}
            >
              <SignupForm />
            </div>
            <p
              className="animate-rise mt-4 text-xs text-zinc-500"
              style={{ animationDelay: "0.3s" }}
            >
              Free while in early access · read-only · connect a store in under
              a minute
            </p>
          </div>

          {/* Product shot */}
          <div
            className="animate-rise relative mx-auto max-w-5xl px-6 pb-24"
            style={{ animationDelay: "0.4s" }}
          >
            <div className="animate-floaty relative">
              {/* Cycling sample alert */}
              <div className="absolute -top-9 right-4 z-10 hidden w-80 sm:block lg:-right-10">
                <AlertTicker />
              </div>

              <div className="rounded-2xl bg-gradient-to-b from-white/15 via-white/5 to-transparent p-px">
                <div className="overflow-hidden rounded-2xl border border-transparent bg-ink-800 shadow-[0_20px_100px_rgba(255,92,0,0.18),0_10px_40px_rgba(0,0,0,0.6)]">
                  <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                    <span className="ml-3 hidden rounded-md bg-ink-950 px-3 py-1 text-xs text-zinc-500 sm:block">
                      shopify-ops-monitor.netlify.app
                    </span>
                  </div>
                  <img
                    src={dashboardShot}
                    alt="Live exceptions dashboard: KPI tiles, 14-day trend, per-rule breakdown"
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Rules */}
        <section className="relative border-t border-white/5 bg-ink-900">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                What we watch
              </h2>
              <p className="mt-3 text-lg text-zinc-400">
                Purpose-built rules for the failures that cost you customers.
              </p>
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {RULE_META.map((rule, i) => (
                <Reveal key={rule.id} delay={i * 0.08}>
                  <div
                    className={`group h-full rounded-2xl border border-white/5 bg-ink-800 p-6 transition-all duration-300 ${
                      RULE_GLOW[rule.severity]
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-signal-500/10 text-signal-400 transition-colors group-hover:bg-signal-500/20">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {RULE_ICONS[rule.id]}
                        </svg>
                      </span>
                      <h3 className="font-display text-base font-semibold">
                        {rule.name}
                      </h3>
                      <span
                        className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          SEVERITY_DARK[rule.severity]
                        }`}
                      >
                        {rule.severity}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                      {rule.description}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={0.2}>
              <p className="mt-6 text-sm text-zinc-500">
                More rules ship regularly — every store gets them
                automatically.
              </p>
            </Reveal>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-white/5">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                How it works
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-12 sm:grid-cols-3">
              {STEPS.map(([title, body], i) => (
                <Reveal key={title} delay={i * 0.12}>
                  <span className="text-glow font-display text-5xl font-semibold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {body}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="grain relative overflow-hidden border-t border-white/5 bg-ink-900">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-[-40%] h-[400px] bg-[radial-gradient(ellipse_at_bottom,rgba(255,92,0,0.14),transparent_65%)]"
          />
          <div className="relative mx-auto max-w-6xl px-6 py-24 text-center">
            <Reveal>
              <h2 className="mx-auto max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-5xl">
                Find out what your store isn't telling you.
              </h2>
              <p className="mt-4 text-zinc-400">
                Connect a store and the first sweep runs within the hour.
              </p>
              <div className="mt-8 flex justify-center">
                <SignupForm />
              </div>
              <p className="mt-10 text-sm text-zinc-500">
                Read-only scopes · Tokens encrypted at rest · Row-level
                security on every table · Uninstall any time and your tokens
                are purged immediately
              </p>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-xs text-zinc-600">
          <span className="flex items-center gap-2">
            <Mark size={18} />
            {BRAND_NAME}
          </span>
          <span>Catch store problems before your customers do.</span>
        </div>
      </footer>
    </div>
  );
}
