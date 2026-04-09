import { describe, it, expect } from "vitest";
import { parseLLMJson } from "./parse.js";

describe("parseLLMJson", () => {
  it("parses clean JSON object", () => {
    const input = '{"key": "value", "num": 42}';
    expect(parseLLMJson(input)).toEqual({ key: "value", num: 42 });
  });

  it("parses clean JSON array", () => {
    const input = '[{"id": 1}, {"id": 2}]';
    expect(parseLLMJson(input)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("strips markdown json fences", () => {
    const input = "```json\n{\"key\": \"value\"}\n```";
    expect(parseLLMJson(input)).toEqual({ key: "value" });
  });

  it("strips plain markdown fences", () => {
    const input = "```\n{\"key\": \"value\"}\n```";
    expect(parseLLMJson(input)).toEqual({ key: "value" });
  });

  it("extracts JSON object from surrounding text", () => {
    const input =
      "Here is the result:\n{\"key\": \"value\"}\nThat's the output.";
    expect(parseLLMJson(input)).toEqual({ key: "value" });
  });

  it("extracts JSON array from surrounding text", () => {
    const input = "The flows are:\n[{\"id\": \"flow-1\"}]\nEnd.";
    expect(parseLLMJson(input)).toEqual([{ id: "flow-1" }]);
  });

  it("handles nested braces correctly", () => {
    const input =
      'Some text {"outer": {"inner": {"deep": true}}, "arr": [1, 2, 3]} more text';
    expect(parseLLMJson(input)).toEqual({
      outer: { inner: { deep: true } },
      arr: [1, 2, 3],
    });
  });

  it("handles whitespace-padded JSON", () => {
    const input = '   \n  {"key": "value"}  \n  ';
    expect(parseLLMJson(input)).toEqual({ key: "value" });
  });

  it("throws on completely invalid input with descriptive message", () => {
    expect(() => parseLLMJson("this is not json at all")).toThrow(
      "Failed to parse LLM JSON output",
    );
  });

  it("throws on empty string", () => {
    expect(() => parseLLMJson("")).toThrow("Failed to parse LLM JSON output");
  });

  it("handles braces inside strings without breaking bracket tracking", () => {
    const input = '{"message": "value with {braces} inside", "ok": true}';
    expect(parseLLMJson(input)).toEqual({
      message: "value with {braces} inside",
      ok: true,
    });
  });

  it("handles escaped quotes inside strings", () => {
    const input = '{"msg": "he said \\"hello\\"", "x": 1}';
    expect(parseLLMJson(input)).toEqual({ msg: 'he said "hello"', x: 1 });
  });
});
