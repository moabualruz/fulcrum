import { DataSource, type DataSourceOptions } from "typeorm";
import { PGliteDriver } from "typeorm-pglite";
import { resolveDatabaseConfig } from "@platform-core/application/db/database-config.ts";
import { FULCRUM_TYPEORM_MIGRATIONS_TABLE } from "@platform-core/infrastructure/database/typeorm-data-source.ts";

// Entity imports — all converted in Task 2 of MikroORM → TypeORM migration
import { ArtifactRetentionPolicy } from "./entities/artifacts/ArtifactRetentionPolicy.ts";
import { AuditEvent } from "./entities/audit/AuditEvent.ts";
import { AuditExport } from "./entities/audit/AuditExport.ts";
import { Account } from "./entities/auth/Account.ts";
import { FeatureFlag } from "./entities/auth/FeatureFlag.ts";
import { Invitation } from "./entities/auth/Invitation.ts";
import { Org } from "./entities/auth/Org.ts";
import { OrgMember } from "./entities/auth/OrgMember.ts";
import { Session } from "./entities/auth/Session.ts";
import { User } from "./entities/auth/User.ts";
import { Verification } from "./entities/auth/Verification.ts";
import { BitbucketIssue } from "./entities/connectors/BitbucketIssue.ts";
import { BitbucketPullRequest } from "./entities/connectors/BitbucketPullRequest.ts";
import { ConnectorSyncLog } from "./entities/connectors/ConnectorSyncLog.ts";
import { GithubConnectorState } from "./entities/connectors/GithubConnectorState.ts";
import { GitlabIssue } from "./entities/connectors/GitlabIssue.ts";
import { GitlabMergeRequest } from "./entities/connectors/GitlabMergeRequest.ts";
import { Event } from "./entities/core/Event.ts";
import { DocComment } from "./entities/docs/DocComment.ts";
import { DocLink } from "./entities/docs/DocLink.ts";
import { DocTemplate } from "./entities/docs/DocTemplate.ts";
import { Document } from "./entities/docs/Document.ts";
import { DocVersion } from "./entities/docs/DocVersion.ts";
import { CasbinRule } from "./entities/flags/CasbinRule.ts";
import { NotificationRule as FlagNotificationRule } from "./entities/flags/NotificationRule.ts";
import { WebhookSubscription } from "./entities/flags/WebhookSubscription.ts";
import { ModelCache } from "./entities/inference/ModelCache.ts";
import { ProviderCredential } from "./entities/inference/ProviderCredential.ts";
import { Job } from "./entities/jobs/Job.ts";
import { ContextSnapshot } from "./entities/memory/ContextSnapshot.ts";
import { Memory } from "./entities/memory/Memory.ts";
import { MemoryLink } from "./entities/memory/MemoryLink.ts";
import { EventRetentionPolicy } from "./entities/notifications/EventRetentionPolicy.ts";
import { Notification } from "./entities/notifications/Notification.ts";
import { NotificationDelivery } from "./entities/notifications/NotificationDelivery.ts";
import { NotificationMute } from "./entities/notifications/NotificationMute.ts";
import { NotificationQuietHours } from "./entities/notifications/NotificationQuietHours.ts";
import { NotificationRule } from "./entities/notifications/NotificationRule.ts";
import { PushSubscription } from "./entities/notifications/PushSubscription.ts";
import { Webhook } from "./entities/notifications/Webhook.ts";
import { WebhookDelivery } from "./entities/notifications/WebhookDelivery.ts";
import { WebhookRuleConfig } from "./entities/notifications/WebhookRuleConfig.ts";
import { AgentRun } from "./entities/orchestration/AgentRun.ts";
import { WorkflowDefinition } from "./entities/orchestration/WorkflowDefinition.ts";
import { Credential } from "./entities/platform/Credential.ts";
import { DomainEventOutbox } from "./entities/platform/DomainEventOutbox.ts";
import { ErrorLog } from "./entities/platform/ErrorLog.ts";
import { ExperimentAssignment } from "./entities/platform/ExperimentAssignment.ts";
import { FeatureFlagRollout } from "./entities/platform/FeatureFlagRollout.ts";
import { TelemetryEvent } from "./entities/platform/TelemetryEvent.ts";
import { TelemetryOutbox } from "./entities/platform/TelemetryOutbox.ts";
import { Repo } from "./entities/repos/Repo.ts";
import { RepoBlameLine } from "./entities/repos/RepoBlameLine.ts";
import { RepoBranch } from "./entities/repos/RepoBranch.ts";
import { RepoCommit } from "./entities/repos/RepoCommit.ts";
import { RepoFilesIndex } from "./entities/repos/RepoFilesIndex.ts";
import { RepoTreeEntry } from "./entities/repos/RepoTreeEntry.ts";
import { RoutingAudit } from "./entities/router/RoutingAudit.ts";
import { RoutingDraft } from "./entities/router/RoutingDraft.ts";
import { RoutingRule } from "./entities/router/RoutingRule.ts";
import { AgentProfile } from "./entities/sandbox/AgentProfile.ts";
import { Artifact } from "./entities/sandbox/Artifact.ts";
import { Edge } from "./entities/sandbox/Edge.ts";
import { SchemaMigration } from "./entities/SchemaMigration.ts";
import { SavedSearch } from "./entities/search/SavedSearch.ts";
import { SearchDocument } from "./entities/search/SearchDocument.ts";
import { ConnectorCredential } from "./entities/settings/ConnectorCredential.ts";
import { FulcrumSkill } from "./entities/skills/FulcrumSkill.ts";
import { McpVirtualSkill } from "./entities/skills/McpVirtualSkill.ts";
import { SkillConflict } from "./entities/skills/SkillConflict.ts";
import { SkillVersion } from "./entities/skills/SkillVersion.ts";
import { CommentReaction } from "./entities/tasks/CommentReaction.ts";
import { CustomFieldDef } from "./entities/tasks/CustomFieldDef.ts";
import { FieldDependencyRule } from "./entities/tasks/FieldDependencyRule.ts";
import { MetricsCache } from "./entities/tasks/MetricsCache.ts";
import { Project } from "./entities/tasks/Project.ts";
import { ProjectAutomation } from "./entities/tasks/ProjectAutomation.ts";
import { SavedView } from "./entities/tasks/SavedView.ts";
import { Sprint } from "./entities/tasks/Sprint.ts";
import { Task } from "./entities/tasks/Task.ts";
import { TaskComment } from "./entities/tasks/TaskComment.ts";
import { TaskRecurrenceRule } from "./entities/tasks/TaskRecurrenceRule.ts";
import { TaskRelationship } from "./entities/tasks/TaskRelationship.ts";
import { TaskStatus } from "./entities/tasks/TaskStatus.ts";
import { TaskTemplate } from "./entities/tasks/TaskTemplate.ts";
import { TaskWatcher } from "./entities/tasks/TaskWatcher.ts";
import { YjsSnapshot } from "./entities/tasks/YjsSnapshot.ts";
import { TenantSetting } from "./entities/TenantSetting.ts";

export function createDataSourceOptions(
  extraEntities: Function[] = [],
  env: Record<string, string | undefined> = process.env,
): DataSourceOptions {
  const database = resolveDatabaseConfig({ env });

  return {
    type: "postgres",
    ...(database.backend === "pglite"
      ? { driver: new PGliteDriver({ dataDir: database.dataDir }).driver }
      : { url: database.url }),
    entities: [...getCoreEntities(), ...extraEntities],
    migrations: [__dirname + "/migrations/*.{ts,js}"],
    migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
    synchronize: false,
    logging: env["TYPEORM_LOGGING"] === "true",
  };
}

export function getCoreEntities(): Function[] {
  return [
    ArtifactRetentionPolicy,
    AuditEvent,
    AuditExport,
    Account,
    FeatureFlag,
    Invitation,
    Org,
    OrgMember,
    Session,
    User,
    Verification,
    BitbucketIssue,
    BitbucketPullRequest,
    ConnectorSyncLog,
    GithubConnectorState,
    GitlabIssue,
    GitlabMergeRequest,
    Event,
    DocComment,
    DocLink,
    DocTemplate,
    Document,
    DocVersion,
    CasbinRule,
    FlagNotificationRule,
    WebhookSubscription,
    ModelCache,
    ProviderCredential,
    Job,
    ContextSnapshot,
    Memory,
    MemoryLink,
    EventRetentionPolicy,
    Notification,
    NotificationDelivery,
    NotificationMute,
    NotificationQuietHours,
    NotificationRule,
    PushSubscription,
    Webhook,
    WebhookDelivery,
    WebhookRuleConfig,
    AgentRun,
    WorkflowDefinition,
    Credential,
    DomainEventOutbox,
    ErrorLog,
    ExperimentAssignment,
    FeatureFlagRollout,
    TelemetryEvent,
    TelemetryOutbox,
    Repo,
    RepoBlameLine,
    RepoBranch,
    RepoCommit,
    RepoFilesIndex,
    RepoTreeEntry,
    RoutingAudit,
    RoutingDraft,
    RoutingRule,
    AgentProfile,
    Artifact,
    Edge,
    SchemaMigration,
    SavedSearch,
    SearchDocument,
    ConnectorCredential,
    FulcrumSkill,
    McpVirtualSkill,
    SkillConflict,
    SkillVersion,
    CommentReaction,
    CustomFieldDef,
    FieldDependencyRule,
    MetricsCache,
    Project,
    ProjectAutomation,
    SavedView,
    Sprint,
    Task,
    TaskComment,
    TaskRecurrenceRule,
    TaskRelationship,
    TaskStatus,
    TaskTemplate,
    TaskWatcher,
    YjsSnapshot,
    TenantSetting,
  ];
}

let defaultDataSource: DataSource | undefined;

export async function initDataSource(
  options?: Partial<DataSourceOptions>,
): Promise<DataSource> {
  if (defaultDataSource?.isInitialized) return defaultDataSource;
  defaultDataSource = new DataSource({
    ...createDataSourceOptions(),
    ...options,
  } as DataSourceOptions);
  await defaultDataSource.initialize();
  return defaultDataSource;
}

export function __resetDataSourceForTest(): void {
  defaultDataSource = undefined;
}
