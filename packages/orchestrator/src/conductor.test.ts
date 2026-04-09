import { describe, it, expect } from "vitest";
import type { ConductorOptions } from "./conductor.js";

describe("ConductorOptions", () => {
  it("accepts outputDir as an optional field", () => {
    const options: ConductorOptions = {
      agents: [],
      context: {} as ConductorOptions["context"],
      outputDir: "/tmp/test-output",
    };
    expect(options.outputDir).toBe("/tmp/test-output");
  });

  it("outputDir is optional (backward compatible)", () => {
    const options: ConductorOptions = {
      agents: [],
      context: {} as ConductorOptions["context"],
    };
    expect(options.outputDir).toBeUndefined();
  });
});
