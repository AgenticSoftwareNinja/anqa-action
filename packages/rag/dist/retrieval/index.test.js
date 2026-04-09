import { describe, it, expect, vi } from "vitest";
import { createRAGClient } from "./index.js";
function mockSupabase(rpcResult = [], insertResult = { id: "test-id" }) {
    return {
        rpc: vi.fn().mockResolvedValue({ data: rpcResult, error: null }),
        from: vi.fn().mockReturnValue({
            insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    single: vi
                        .fn()
                        .mockResolvedValue({ data: insertResult, error: null }),
                }),
            }),
            delete: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
            }),
        }),
    };
}
function mockEmbeddings() {
    return {
        embed: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
        embedBatch: vi.fn().mockResolvedValue([]),
        dimensions: 1536,
    };
}
describe("createRAGClient", () => {
    describe("search", () => {
        it("passes projectId as filter_project_id to RPC", async () => {
            const supabase = mockSupabase();
            const embeddings = mockEmbeddings();
            const client = createRAGClient({ supabase, embeddings });
            await client.search("test query", { projectId: "proj-abc" });
            expect(supabase.rpc).toHaveBeenCalledWith("match_knowledge", expect.objectContaining({ filter_project_id: "proj-abc" }));
        });
        it("passes null for filter_project_id when projectId is undefined", async () => {
            const supabase = mockSupabase();
            const embeddings = mockEmbeddings();
            const client = createRAGClient({ supabase, embeddings });
            await client.search("test query");
            expect(supabase.rpc).toHaveBeenCalledWith("match_knowledge", expect.objectContaining({ filter_project_id: null }));
        });
    });
    describe("ingest", () => {
        it("includes project_id in insert when provided", async () => {
            const supabase = mockSupabase();
            const embeddings = mockEmbeddings();
            const client = createRAGClient({ supabase, embeddings });
            const insertMock = supabase.from("knowledge").insert;
            await client.ingest({
                type: "pattern",
                content: "test content",
                projectId: "proj-xyz",
            });
            expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ project_id: "proj-xyz" }));
        });
        it("includes project_id: null when projectId is not provided", async () => {
            const supabase = mockSupabase();
            const embeddings = mockEmbeddings();
            const client = createRAGClient({ supabase, embeddings });
            const insertMock = supabase.from("knowledge").insert;
            await client.ingest({
                type: "pattern",
                content: "test content",
            });
            expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ project_id: null }));
        });
    });
});
//# sourceMappingURL=index.test.js.map