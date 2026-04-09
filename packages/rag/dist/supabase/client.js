import { createClient } from "@supabase/supabase-js";
let instance = null;
export function getSupabaseClient(options) {
    if (instance)
        return instance;
    instance = createClient(options.url, options.serviceRoleKey, {
        auth: { persistSession: false },
    });
    options.logger?.info("Supabase client initialized", { url: options.url });
    return instance;
}
export function resetSupabaseClient() {
    instance = null;
}
//# sourceMappingURL=client.js.map