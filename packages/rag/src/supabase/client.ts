import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "@agentic-nqa/core";

export interface SupabaseOptions {
  url: string;
  serviceRoleKey: string;
  logger?: Logger;
}

let instance: SupabaseClient | null = null;

export function getSupabaseClient(options: SupabaseOptions): SupabaseClient {
  if (instance) return instance;

  instance = createClient(options.url, options.serviceRoleKey, {
    auth: { persistSession: false },
  });

  options.logger?.info("Supabase client initialized", { url: options.url });
  return instance;
}

export function resetSupabaseClient(): void {
  instance = null;
}
