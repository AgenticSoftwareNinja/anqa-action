import { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "@agentic-nqa/core";
export interface SupabaseOptions {
    url: string;
    serviceRoleKey: string;
    logger?: Logger;
}
export declare function getSupabaseClient(options: SupabaseOptions): SupabaseClient;
export declare function resetSupabaseClient(): void;
//# sourceMappingURL=client.d.ts.map