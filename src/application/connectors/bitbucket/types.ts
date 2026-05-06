export interface AppContext { orgId: string; userId: string | null; projectId?: string | null }
export interface BitbucketPullRequestDto { id: string; orgId: string; projectId: string; repoSlug: string; pullRequestId: string; title: string; state: string }
export interface UpsertBitbucketPullRequestInput { repoSlug: string; pullRequestId: string; title: string; state: string }
