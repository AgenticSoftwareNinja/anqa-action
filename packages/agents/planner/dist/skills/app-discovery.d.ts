import type { BrowserSnapshot, Skill } from "@agentic-nqa/core";
export interface PageInventory {
    pages: PageInfo[];
    navigationGraph: Map<string, string[]>;
}
export interface PageInfo {
    url: string;
    title: string;
    snapshot: BrowserSnapshot;
    links: string[];
    forms: FormInfo[];
    interactiveElements: number;
}
export interface FormInfo {
    action: string;
    fields: string[];
}
export declare const appDiscoverySkill: Skill;
//# sourceMappingURL=app-discovery.d.ts.map