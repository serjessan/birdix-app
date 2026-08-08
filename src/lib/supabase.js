import { createClient } from "@supabase/supabase-js";

// ponytail: un cliente, sin wrapper propio — supabase-js ya expone lo que hace falta.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
