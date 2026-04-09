import type { GenerateTestResult } from "./types.js";
export declare function buildBranchName(): string;
interface PRBodyOptions {
    tests: GenerateTestResult[];
    targetUrl: string;
    coverageBefore: number;
    coverageAfter: number;
    estimatedCost: number;
    failedCount: number;
}
export declare function buildPRBody(options: PRBodyOptions): string;
export {};
//# sourceMappingURL=pr-builder.d.ts.map