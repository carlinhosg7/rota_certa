import { createClient } from "@supabase/supabase-js";

const url = (process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SECRET_KEY || "").trim();

if (!url) throw new Error("SUPABASE_URL não configurada.");
if (!key) throw new Error("SUPABASE_SECRET_KEY não configurada.");

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
