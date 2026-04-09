import type { CoverageMap, ExistingTestFile, LLMClient, Skill, TestFlow } from "@agentic-nqa/core";
export declare function evaluateCoverage(flows: TestFlow[], existingTests: ExistingTestFile[], llm: LLMClient, model: string): Promise<CoverageMap>;
export declare const coverageEvaluatorSkill: Skill;
//# sourceMappingURL=coverage-evaluator.d.ts.map