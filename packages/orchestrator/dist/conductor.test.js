import { describe, it, expect } from "vitest";
describe("ConductorOptions", () => {
    it("accepts outputDir as an optional field", () => {
        const options = {
            agents: [],
            context: {},
            outputDir: "/tmp/test-output",
        };
        expect(options.outputDir).toBe("/tmp/test-output");
    });
    it("outputDir is optional (backward compatible)", () => {
        const options = {
            agents: [],
            context: {},
        };
        expect(options.outputDir).toBeUndefined();
    });
});
//# sourceMappingURL=conductor.test.js.map