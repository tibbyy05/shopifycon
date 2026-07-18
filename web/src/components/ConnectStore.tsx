import { useState } from "react";
import { supabase } from "../lib/supabase";

export function ConnectStore() {
  const [shop, setShop] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke("shopify-oauth", {
      body: { shop: shop.trim().toLowerCase() },
    });
    if (error || !data?.authorizeUrl) {
      setBusy(false);
      setError(error?.message ?? "Could not start the install flow.");
      return;
    }
    window.location.href = data.authorizeUrl;
  }

  return (
    <form onSubmit={connect} className="flex items-center gap-2">
      <input
        value={shop}
        onChange={(e) => setShop(e.target.value)}
        placeholder="your-store.myshopify.com"
        pattern="[a-z0-9][a-z0-9\-]*\.myshopify\.com"
        required
        className="w-64 rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {busy ? "Redirecting…" : "Connect store"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
