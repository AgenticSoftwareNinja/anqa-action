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
export function parseLLMJson(content) {
    if (!content) {
        throw new Error("Failed to parse LLM JSON output: input is empty");
    }
    // Step 1 — strip markdown code fences
    const stripped = stripMarkdownFences(content);
    // Step 2 — try direct parse on trimmed content
    const trimmed = stripped.trim();
    try {
        return JSON.parse(trimmed);
    }
    catch {
        // Fall through to extraction
    }
    // Step 3 — find the first JSON structure and extract it
    const extracted = extractFirstJsonStructure(stripped);
    if (extracted !== null) {
        try {
            return JSON.parse(extracted);
        }
        catch {
            // Fall through to error
        }
    }
    throw new Error(`Failed to parse LLM JSON output: could not find valid JSON in response. Content preview: ${content.slice(0, 200)}`);
}
/**
 * Remove leading/trailing markdown code fences from a string.
 * Handles both ```json ... ``` and ``` ... ``` variants.
 */
function stripMarkdownFences(content) {
    return content
        .trim()
        .replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i, "$1")
        .trim();
}
/**
 * Scan `content` for the first `{` or `[` character and extract the balanced
 * JSON structure starting there. Returns `null` if no structure is found.
 *
 * Uses bracket-depth tracking that correctly skips over string literals
 * (including escaped characters).
 */
function extractFirstJsonStructure(content) {
    const start = findFirstStructureStart(content);
    if (start === -1)
        return null;
    const openChar = content[start];
    const closeChar = openChar === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let i = start;
    while (i < content.length) {
        const ch = content[i];
        if (inString) {
            if (ch === "\\") {
                // Skip the escaped character
                i += 2;
                continue;
            }
            if (ch === '"') {
                inString = false;
            }
            i++;
            continue;
        }
        if (ch === '"') {
            inString = true;
            i++;
            continue;
        }
        if (ch === openChar) {
            depth++;
        }
        else if (ch === closeChar) {
            depth--;
            if (depth === 0) {
                return content.slice(start, i + 1);
            }
        }
        i++;
    }
    return null;
}
/** Return the index of the first `{` or `[` in `content`, or -1 if absent. */
function findFirstStructureStart(content) {
    const objIdx = content.indexOf("{");
    const arrIdx = content.indexOf("[");
    if (objIdx === -1 && arrIdx === -1)
        return -1;
    if (objIdx === -1)
        return arrIdx;
    if (arrIdx === -1)
        return objIdx;
    return Math.min(objIdx, arrIdx);
}
//# sourceMappingURL=parse.js.map