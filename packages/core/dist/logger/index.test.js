import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "./index.js";
describe("createLogger", () => {
    let stdoutSpy;
    let stderrSpy;
    beforeEach(() => {
        stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    function getStdoutEntry(callIndex = 0) {
        const raw = stdoutSpy.mock.calls[callIndex][0];
        return JSON.parse(raw.trimEnd());
    }
    function getStderrEntry(callIndex = 0) {
        const raw = stderrSpy.mock.calls[callIndex][0];
        return JSON.parse(raw.trimEnd());
    }
    describe("info level", () => {
        it("writes to stdout as JSON with timestamp, level, and message", () => {
            const logger = createLogger();
            logger.info("hello world");
            expect(stdoutSpy).toHaveBeenCalledOnce();
            expect(stderrSpy).not.toHaveBeenCalled();
            const entry = getStdoutEntry();
            expect(entry.level).toBe("info");
            expect(entry.message).toBe("hello world");
            expect(typeof entry.timestamp).toBe("string");
            expect(() => new Date(entry.timestamp)).not.toThrow();
        });
        it("appends a newline after the JSON payload", () => {
            const logger = createLogger();
            logger.info("newline check");
            const raw = stdoutSpy.mock.calls[0][0];
            expect(raw.endsWith("\n")).toBe(true);
        });
    });
    describe("error level", () => {
        it("writes to stderr, not stdout", () => {
            const logger = createLogger();
            logger.error("something broke");
            expect(stderrSpy).toHaveBeenCalledOnce();
            expect(stdoutSpy).not.toHaveBeenCalled();
            const entry = getStderrEntry();
            expect(entry.level).toBe("error");
            expect(entry.message).toBe("something broke");
        });
    });
    describe("warn level", () => {
        it("writes to stdout with level warn", () => {
            const logger = createLogger();
            logger.warn("watch out");
            expect(stdoutSpy).toHaveBeenCalledOnce();
            const entry = getStdoutEntry();
            expect(entry.level).toBe("warn");
            expect(entry.message).toBe("watch out");
        });
    });
    describe("debug level", () => {
        it("writes to stdout when minLevel is debug", () => {
            const logger = createLogger({}, "debug");
            logger.debug("verbose detail");
            expect(stdoutSpy).toHaveBeenCalledOnce();
            const entry = getStdoutEntry();
            expect(entry.level).toBe("debug");
            expect(entry.message).toBe("verbose detail");
        });
        it("is suppressed when minLevel is info (default)", () => {
            const logger = createLogger();
            logger.debug("should be suppressed");
            expect(stdoutSpy).not.toHaveBeenCalled();
            expect(stderrSpy).not.toHaveBeenCalled();
        });
    });
    describe("minLevel filtering", () => {
        it("suppresses levels below minLevel", () => {
            const logger = createLogger({}, "warn");
            logger.debug("nope");
            logger.info("nope");
            expect(stdoutSpy).not.toHaveBeenCalled();
            expect(stderrSpy).not.toHaveBeenCalled();
        });
        it("allows levels at minLevel", () => {
            const logger = createLogger({}, "warn");
            logger.warn("yes");
            expect(stdoutSpy).toHaveBeenCalledOnce();
        });
        it("allows levels above minLevel", () => {
            const logger = createLogger({}, "warn");
            logger.error("yes");
            expect(stderrSpy).toHaveBeenCalledOnce();
        });
        it("passes all levels when minLevel is debug", () => {
            const logger = createLogger({}, "debug");
            logger.debug("d");
            logger.info("i");
            logger.warn("w");
            logger.error("e");
            // debug, info, warn → stdout (3 calls); error → stderr (1 call)
            expect(stdoutSpy).toHaveBeenCalledTimes(3);
            expect(stderrSpy).toHaveBeenCalledTimes(1);
        });
    });
    describe("context merging", () => {
        it("includes context fields in every log entry", () => {
            const logger = createLogger({ service: "api", version: "1.0" });
            logger.info("request received");
            const entry = getStdoutEntry();
            expect(entry.service).toBe("api");
            expect(entry.version).toBe("1.0");
        });
        it("data parameter fields are merged into log entry", () => {
            const logger = createLogger();
            logger.info("user action", { userId: 42, action: "click" });
            const entry = getStdoutEntry();
            expect(entry.userId).toBe(42);
            expect(entry.action).toBe("click");
        });
        it("data parameter overrides context when keys conflict", () => {
            const logger = createLogger({ requestId: "ctx-id" });
            logger.info("override test", { requestId: "data-id" });
            const entry = getStdoutEntry();
            expect(entry.requestId).toBe("data-id");
        });
        it("context, data, and core fields all appear together", () => {
            const logger = createLogger({ env: "test" });
            logger.warn("combined", { extra: true });
            const entry = getStdoutEntry();
            expect(entry.level).toBe("warn");
            expect(entry.message).toBe("combined");
            expect(entry.env).toBe("test");
            expect(entry.extra).toBe(true);
            expect(entry.timestamp).toBeDefined();
        });
    });
    describe("child logger", () => {
        it("inherits parent context", () => {
            const parent = createLogger({ service: "core" });
            const child = parent.child({ requestId: "req-1" });
            child.info("child log");
            const entry = getStdoutEntry();
            expect(entry.service).toBe("core");
            expect(entry.requestId).toBe("req-1");
        });
        it("child context overrides parent context on key conflict", () => {
            const parent = createLogger({ env: "parent" });
            const child = parent.child({ env: "child" });
            child.info("override check");
            const entry = getStdoutEntry();
            expect(entry.env).toBe("child");
        });
        it("child does not affect parent context", () => {
            const parent = createLogger({ service: "parent" });
            const child = parent.child({ extra: "only-in-child" });
            parent.info("parent log");
            child.info("child log");
            const parentEntry = getStdoutEntry(0);
            const childEntry = getStdoutEntry(1);
            expect(parentEntry.extra).toBeUndefined();
            expect(childEntry.extra).toBe("only-in-child");
        });
        it("inherits minLevel from parent", () => {
            const parent = createLogger({}, "warn");
            const child = parent.child({ tag: "child" });
            child.debug("suppressed");
            child.info("also suppressed");
            expect(stdoutSpy).not.toHaveBeenCalled();
            child.warn("passes");
            expect(stdoutSpy).toHaveBeenCalledOnce();
        });
        it("supports multiple levels of nesting", () => {
            const root = createLogger({ layer: "root" });
            const mid = root.child({ layer: "mid" });
            const leaf = mid.child({ layer: "leaf", extra: "yes" });
            leaf.info("deep log");
            const entry = getStdoutEntry();
            expect(entry.layer).toBe("leaf");
            expect(entry.extra).toBe("yes");
        });
    });
});
//# sourceMappingURL=index.test.js.map