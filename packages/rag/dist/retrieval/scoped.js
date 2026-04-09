/**
 * Wraps a RAGClient to automatically inject projectId into all operations.
 * Skills and agents use this transparently — no code changes needed.
 */
export function createScopedRAGClient(client, projectId) {
    return {
        search(query, options) {
            return client.search(query, projectId !== undefined ? { ...options, projectId } : options);
        },
        ingest(entry) {
            return client.ingest(projectId !== undefined ? { ...entry, projectId } : entry);
        },
        delete(id) {
            return client.delete(id);
        },
    };
}
//# sourceMappingURL=scoped.js.map