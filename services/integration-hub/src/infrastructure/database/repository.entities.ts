import { EntitySchema } from "typeorm";

export interface IntegrationRepository {
  id: string;
  orgId: string;
  projectId: string | null;
  name: string;
  slug: string;
  kind: "local" | "remote";
  localPath: string | null;
  remoteUrl: string | null;
  defaultBranch: string | null;
  currentBranch: string | null;
  lastSyncAt: Date | null;
  syncStatus: string;
  lastTouchedAt: Date | null;
  archived: boolean;
  traceId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IntegrationRepositoryBranch {
  id: string;
  orgId: string;
  repoId: string;
  name: string;
  headSha: string | null;
  isCurrent: boolean;
  isDefault: boolean;
  source: string | null;
  lastSeenAt: Date | null;
  traceId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IntegrationRepositoryCommit {
  id: string;
  orgId: string;
  repoId: string;
  sha: string;
  branch: string | null;
  message: string;
  authorName: string | null;
  authorEmail: string | null;
  committedAt: Date;
  parentShas: string[];
  traceId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const timestampColumns = {
  createdAt: {
    name: "created_at",
    type: "timestamptz",
    createDate: true,
  },
  updatedAt: {
    name: "updated_at",
    type: "timestamptz",
    updateDate: true,
  },
} as const;

export const IntegrationRepositoryEntity = new EntitySchema<IntegrationRepository>({
  name: "IntegrationRepository",
  tableName: "fulcrum_repositories",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    projectId: { name: "project_id", type: "varchar", length: 128, nullable: true },
    name: { type: "varchar", length: 240 },
    slug: { type: "varchar", length: 160 },
    kind: { type: "varchar", length: 32 },
    localPath: { name: "local_path", type: "text", nullable: true },
    remoteUrl: { name: "remote_url", type: "text", nullable: true },
    defaultBranch: { name: "default_branch", type: "varchar", length: 160, nullable: true },
    currentBranch: { name: "current_branch", type: "varchar", length: 160, nullable: true },
    lastSyncAt: { name: "last_sync_at", type: "timestamptz", nullable: true },
    syncStatus: { name: "sync_status", type: "varchar", length: 80, default: "idle" },
    lastTouchedAt: { name: "last_touched_at", type: "timestamptz", nullable: true },
    archived: { type: "boolean", default: false },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...timestampColumns,
  },
  uniques: [{ name: "fulcrum_repositories_org_slug_key", columns: ["orgId", "slug"] }],
  indices: [
    { name: "fulcrum_repositories_org_archived_idx", columns: ["orgId", "archived"] },
    { name: "fulcrum_repositories_org_sync_idx", columns: ["orgId", "syncStatus"] },
    { name: "fulcrum_repositories_trace_idx", columns: ["traceId"] },
  ],
});

export const IntegrationRepositoryBranchEntity = new EntitySchema<IntegrationRepositoryBranch>({
  name: "IntegrationRepositoryBranch",
  tableName: "fulcrum_repository_branches",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    repoId: { name: "repo_id", type: "varchar", length: 128 },
    name: { type: "varchar", length: 240 },
    headSha: { name: "head_sha", type: "varchar", length: 80, nullable: true },
    isCurrent: { name: "is_current", type: "boolean", default: false },
    isDefault: { name: "is_default", type: "boolean", default: false },
    source: { type: "varchar", length: 80, nullable: true },
    lastSeenAt: { name: "last_seen_at", type: "timestamptz", nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...timestampColumns,
  },
  uniques: [{ name: "fulcrum_repository_branches_repo_name_key", columns: ["repoId", "name"] }],
  indices: [
    { name: "fulcrum_repository_branches_org_repo_idx", columns: ["orgId", "repoId"] },
    { name: "fulcrum_repository_branches_org_default_idx", columns: ["orgId", "repoId", "isDefault"] },
    { name: "fulcrum_repository_branches_trace_idx", columns: ["traceId"] },
  ],
});

export const IntegrationRepositoryCommitEntity = new EntitySchema<IntegrationRepositoryCommit>({
  name: "IntegrationRepositoryCommit",
  tableName: "fulcrum_repository_commits",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    repoId: { name: "repo_id", type: "varchar", length: 128 },
    sha: { type: "varchar", length: 80 },
    branch: { type: "varchar", length: 240, nullable: true },
    message: { type: "text" },
    authorName: { name: "author_name", type: "varchar", length: 240, nullable: true },
    authorEmail: { name: "author_email", type: "varchar", length: 320, nullable: true },
    committedAt: { name: "committed_at", type: "timestamptz" },
    parentShas: { name: "parent_shas", type: "simple-json", nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...timestampColumns,
  },
  uniques: [{ name: "fulcrum_repository_commits_repo_sha_key", columns: ["repoId", "sha"] }],
  indices: [
    { name: "fulcrum_repository_commits_org_repo_idx", columns: ["orgId", "repoId"] },
    { name: "fulcrum_repository_commits_repo_time_idx", columns: ["repoId", "committedAt"] },
    { name: "fulcrum_repository_commits_trace_idx", columns: ["traceId"] },
  ],
});

export const INTEGRATION_HUB_REPOSITORY_ENTITIES = [
  IntegrationRepositoryEntity,
  IntegrationRepositoryBranchEntity,
  IntegrationRepositoryCommitEntity,
];
