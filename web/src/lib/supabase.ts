import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(
    "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in web/.env",
  );
}

// Anon key + RLS: the browser can only ever read rows for orgs the
// signed-in user belongs to. Tokens are excluded by column grants.
export const supabase = createClient(url, anonKey);
