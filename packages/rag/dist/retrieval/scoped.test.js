import { describe, it, expect, vi } from "vitest";
import { createScopedRAGClient } from "./scoped.js";
function mockRAGClient() {
    return {
        search: vi.fn().mockResolvedValue([]),
        ingest: vi.fn().mockResolvedValue("test-id"),
        delete: vi.fn().mockResolvedValue(undefined),
    };
}
describe("createScopedRAGClient", () => {
    it("injects projectId into search options", async () => {
        const base = mockRAGClient();
        const scoped = createScopedRAGClient(base, "proj-123");
        await scoped.search("my query", { limit: 5 });
        expect(base.search).toHaveBeenCalledWith("my query", {
            limit: 5,
            projectId: "proj-123",
        });
    });
    it("injects projectId into ingest entries", async () => {
        const base = mockRAGClient();
        const scoped = createScopedRAGClient(base, "proj-123");
        const entry = { type: "pattern", content: "some content" };
        await scoped.ingest(entry);
        expect(base.ingest).toHaveBeenCalledWith({
            type: "pattern",
            content: "some content",
            projectId: "proj-123",
        });
    });
    it("passes through delete unchanged", async () => {
        const base = mockRAGClient();
        const scoped = createScopedRAGClient(base, "proj-123");
        await scoped.delete("entry-abc");
        expect(base.delete).toHaveBeenCalledWith("entry-abc");
    });
    it("does not override projectId when undefined", async () => {
        const base = mockRAGClient();
        const scoped = createScopedRAGClient(base, undefined);
        await scoped.search("query", { projectId: "caller-proj" });
        // When scoped projectId is undefined, caller's projectId survives via spread
        expect(base.search).toHaveBeenCalledWith("query", {
            projectId: "caller-proj",
        });
    });
});
//# sourceMappingURL=scoped.test.js.map