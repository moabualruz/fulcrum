export interface AppContext { orgId: string; userId: string | null; projectId?: string | null }
export interface RepoDto { id: string; orgId: string; slug: string; name: string; kind: string; localPath: string | null; remoteUrl?: string | null; defaultBranch?: string | null; currentBranch?: string | null; lastSyncAt?: Date | null; syncStatus?: string | null }
export interface RepoTreeEntryDto { id: string; orgId: string; repoId: string; commitSha: string; path: string; kind: string }
export interface RegisterRepoInput { slug: string; name: string; kind: "local" | "remote"; localPath?: string | null; remoteUrl?: string | null }
export interface InsertRepoTreeEntryInput { repoId: string; commitSha: string; path: string; kind: string }
