export interface AppContext { orgId: string; userId: string | null; projectId?: string | null }
export interface GitlabMergeRequestDto { id: string; orgId: string; projectId: string; repoPath: string; mergeRequestIid: string; title: string; state: string }
export interface UpsertGitlabMergeRequestInput { repoPath: string; mergeRequestIid: string; title: string; state: string }
