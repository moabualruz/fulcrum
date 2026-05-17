export interface AppContext { orgId: string; userId: string | null; projectId?: string | null }
export interface GithubConnectorStateDto { id: string; orgId: string; projectId: string; installationId: string; repoFullName: string; cursor: string | null }
export interface UpsertGithubConnectorStateInput { installationId: string; repoFullName: string; cursor?: string | null }
