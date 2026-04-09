/**
 * Robustly parse JSON from LLM output.
 *
 * LLMs often wrap their JSON response in markdown fences or add preamble /
 * postamble prose. This utility handles those cases so callers never need to
 * worry about it.
 *
 * Strategy (in order):
 *  1. Strip markdown code fences (```json … ``` or ``` … ```)
 *  2. Try direct JSON.parse on the trimmed result
 *  3. If that fails, scan for the first `{` or `[`, then walk forward tracking
 *     bracket depth (skipping string contents) to extract the balanced JSON
 *     substring, then parse that
 *  4. Throw a descriptive error if nothing works
 */
export declare function parseLLMJson<T>(content: string): T;
//# sourceMappingURL=parse.d.ts.map