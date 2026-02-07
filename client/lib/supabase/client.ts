import { createBrowserClient } from "@supabase/ssr";

// Using a singleton pattern to ensure we only have one Supabase instance on the client
let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    // We log an error instead of crashing the whole app with '!'
    console.error("Supabase environment variables are missing!");
  }

  client = createBrowserClient(
    url ?? "",
    key ?? ""
  );

  return client;
}

// Export a constant for easy importing in other files
export const supabase = createClient();