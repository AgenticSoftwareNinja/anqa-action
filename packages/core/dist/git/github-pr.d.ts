export interface GitHubPRClient {
    createBranch(options: CreateBranchOptions): Promise<void>;
    commitFiles(options: CommitFilesOptions): Promise<string>;
    createPR(options: CreatePROptions): Promise<{
        url: string;
        number: number;
    }>;
    deleteBranch(options: {
        owner: string;
        repo: string;
        branch: string;
    }): Promise<void>;
    pushToExistingBranch(options: PushToExistingBranchOptions): Promise<string>;
}
export interface CreateBranchOptions {
    owner: string;
    repo: string;
    baseBranch: string;
    newBranch: string;
}
export interface CommitFilesOptions {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    files: Array<{
        path: string;
        content: string;
    }>;
}
export interface CreatePROptions {
    owner: string;
    repo: string;
    head: string;
    base: string;
    title: string;
    body: string;
}
export interface PushToExistingBranchOptions {
    owner: string;
    repo: string;
    branch: string;
    files: Array<{
        path: string;
        content: string;
    }>;
    message: string;
}
export declare function createGitHubPRClient(options: {
    token: string;
}): GitHubPRClient;
//# sourceMappingURL=github-pr.d.ts.map