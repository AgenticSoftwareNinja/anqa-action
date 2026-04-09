import { type Skill, type TestResult } from "@agentic-nqa/core";
export interface VerificationResult {
    passed: boolean;
    results: TestResult[];
    rawOutput: string;
}
export declare const selfVerifySkill: Skill;
//# sourceMappingURL=self-verify.d.ts.map