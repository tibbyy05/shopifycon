import { useState } from "react";
import { supabase } from "../lib/supabase";
import { RULE_META } from "../lib/rules";
import { SeverityBadge } from "./Badges";

function SignInCard() {
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

  return (
    <div
      id="signin"
      className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-slate-900">
        Sign in or create your account
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        No password — we email you a magic link.
      </p>
      {sent ? (
        <p className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-700">
          Check your inbox — we sent a sign-in link to {email}.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Get started free"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </div>
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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-base font-semibold text-slate-900">
            Shopify Operations Monitor
          </span>
          <a
            href="#signin"
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Sign in
          </a>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-6 py-16 lg:flex-row lg:justify-between lg:py-24">
          <div className="max-w-xl">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
              Your Shopify store breaks quietly.
              <br />
              <span className="text-emerald-600">We make it loud.</span>
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Paid orders that never ship. Checkouts that stop converting at
              2am. Products overselling to negative stock. Shopify records it
              all — but doesn't watch it. We do, every hour, and alert you
              before a customer ever emails.
            </p>
            <ul className="mt-6 space-y-1.5 text-sm text-slate-600">
              <li>✓ Read-only access — we never modify your store</li>
              <li>✓ Live dashboard with one-click deep links into your admin</li>
              <li>✓ Alerts by email or Slack, per store, per rule</li>
            </ul>
          </div>
          <SignInCard />
        </section>

        {/* Rules */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              What we watch
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {RULE_META.map((rule) => (
                <div
                  key={rule.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {rule.name}
                    </h3>
                    <SeverityBadge severity={rule.severity} />
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500">
                    {rule.description}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-400">
              More rules ship regularly — every store gets them automatically.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-slate-200">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              How it works
            </h2>
            <div className="mt-6 grid gap-8 sm:grid-cols-3">
              {STEPS.map(([title, body], i) => (
                <div key={title}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-slate-900">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-500">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <p className="text-center text-sm text-slate-500">
              Read-only scopes · Tokens encrypted at rest · Row-level security
              on every table · You can uninstall any time and your tokens are
              purged immediately
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-6 py-8 text-xs text-slate-400">
          Shopify Operations Monitor — catch store problems before your
          customers do.
        </div>
      </footer>
    </div>
  );
}
