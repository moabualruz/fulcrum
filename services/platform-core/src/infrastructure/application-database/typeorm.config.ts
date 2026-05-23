import { DataSource, EntitySchema, type DataSourceOptions } from "typeorm";
import { PGliteDriver } from "typeorm-pglite";
import { resolveDatabaseConfig } from "@platform-core/application/db/database-config.ts";
import { assertPgliteLockRecoverable } from "@platform-core/application/db/pglite-lock-recovery.ts";
import { FULCRUM_TYPEORM_MIGRATIONS_TABLE } from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { CoreAndAuth1715788800000 } from "./migrations/1715788800000-CoreAndAuth.ts";
import { WorkManagement1715788800001 } from "./migrations/1715788800001-WorkManagement.ts";
import { Knowledge1715788800002 } from "./migrations/1715788800002-Knowledge.ts";
import { Orchestration1715788800003 } from "./migrations/1715788800003-Orchestration.ts";
import { Integration1715788800004 } from "./migrations/1715788800004-Integration.ts";
import { Notifications1715788800005 } from "./migrations/1715788800005-Notifications.ts";
import { Platform1715788800006 } from "./migrations/1715788800006-Platform.ts";
import { Migration20260516AcpSessionColumns1778623200002 } from "./migrations/Migration20260516_acp_sessions.ts";
import { Migration20260519AcpSessionPauseResumeCheckpoints1778841600000 } from "./migrations/Migration20260519_acp_session_checkpoints.ts";
import { Migration20260517NotificationTraceColumn1778760600001 } from "./migrations/Migration20260517_notification_trace_column.ts";
import { ProjectStatuses20260523001778932800000 } from "./migrations/Migration20260523_project_statuses.ts";
import { PlatformFeatureFlags1778753400000 } from "../../../../feature-flags/src/infrastructure/database/migrations/feature-flag.migration.ts";
import { Credential1778623200010 } from "@platform-core/infrastructure/database/credential.migration.ts";
import { ErrorLog1778758800000 } from "@platform-core/infrastructure/database/error-log.migration.ts";
import { Telemetry1778755200000 } from "@platform-core/infrastructure/database/telemetry.migration.ts";
import { NotificationReadState1778750400000 } from "@notification-center/infrastructure/database/notification-read-state.migration.ts";
import { NotificationSettings1778750500000 } from "@notification-center/infrastructure/database/notification-settings.migration.ts";
import { IdentityAccess1778623200009 } from "@identity-access/infrastructure/database/organization.migration.ts";
import { Invitation1778757000000 } from "@identity-access/infrastructure/database/invitation.migration.ts";
import { WorkManagement1778623200003 } from "@work-management/infrastructure/database/work-structure.migration.ts";
import { TaskRecurrence1778760600000 } from "@work-management/infrastructure/database/task-recurrence.migration.ts";
import { WorkAutomations1778752500000 } from "@work-management/infrastructure/database/automation.migration.ts";
import { KnowledgeDocuments1778623200004 } from "@knowledge-workspace/infrastructure/database/document.migration.ts";
import { RunContext1778623200005 } from "@execution-orchestration/infrastructure/database/run-context.migration.ts";
import { Routing1778623200008 } from "@execution-orchestration/infrastructure/database/routing.migration.ts";
import { IntegrationRepositories1778623200006 } from "@integration-hub/infrastructure/database/repository.migration.ts";
import { IntegrationConnectors1778751600000 } from "@integration-hub/infrastructure/database/connector.migration.ts";
import { IntegrationWebhooks1778750700000 } from "@integration-hub/infrastructure/database/webhook.migration.ts";
import { WorkflowSpine1778623200001 } from "@workflow-coordination/infrastructure/database/workflow-spine.migration.ts";
import { WorkflowAudit1778623200008 } from "@workflow-coordination/infrastructure/database/audit-log.migration.ts";
import { ReviewWorkflow1778623200002 } from "@planning-review/infrastructure/database/review-workflow.migration.ts";

// Platform-core owned entities (kept here)
import { Event } from "./entities/core/Event.ts";
import { CasbinRule } from "./entities/flags/CasbinRule.ts";
import { NotificationRule as FlagNotificationRule } from "./entities/flags/NotificationRule.ts";
import { WebhookSubscription } from "./entities/flags/WebhookSubscription.ts";
import { ModelCache } from "./entities/inference/ModelCache.ts";
import { ProviderCredential } from "./entities/inference/ProviderCredential.ts";
import { Job } from "./entities/jobs/Job.ts";
import { Credential } from "./entities/platform/Credential.ts";
import { DomainEventOutbox } from "./entities/platform/DomainEventOutbox.ts";
import { ErrorLog } from "./entities/platform/ErrorLog.ts";
import { ExperimentAssignment } from "./entities/platform/ExperimentAssignment.ts";
import { FeatureFlagRollout } from "./entities/platform/FeatureFlagRollout.ts";
import { TelemetryEvent } from "./entities/platform/TelemetryEvent.ts";
import { TelemetryOutbox } from "./entities/platform/TelemetryOutbox.ts";
import { FulcrumSkill } from "./entities/skills/FulcrumSkill.ts";
import { McpVirtualSkill } from "./entities/skills/McpVirtualSkill.ts";
import { SkillConflict } from "./entities/skills/SkillConflict.ts";
import { SkillVersion } from "./entities/skills/SkillVersion.ts";
import { SchemaMigration } from "./entities/SchemaMigration.ts";
import { TenantSetting } from "./entities/TenantSetting.ts";

// identity-access owned entities
import { Account } from "@identity-access/infrastructure/database/entities/auth/Account.ts";
import { FeatureFlag } from "@identity-access/infrastructure/database/entities/auth/FeatureFlag.ts";
import { Invitation } from "@identity-access/infrastructure/database/entities/auth/Invitation.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { OrgMember } from "@identity-access/infrastructure/database/entities/auth/OrgMember.ts";
import { Session } from "@identity-access/infrastructure/database/entities/auth/Session.ts";
import { User } from "@identity-access/infrastructure/database/entities/auth/User.ts";
import { Verification } from "@identity-access/infrastructure/database/entities/auth/Verification.ts";

// work-management owned entities
import { CommentReaction } from "@work-management/infrastructure/database/entities/tasks/CommentReaction.ts";
import { CustomFieldDef } from "@work-management/infrastructure/database/entities/tasks/CustomFieldDef.ts";
import { FieldDependencyRule } from "@work-management/infrastructure/database/entities/tasks/FieldDependencyRule.ts";
import { MetricsCache } from "@work-management/infrastructure/database/entities/tasks/MetricsCache.ts";
import { Project } from "@work-management/infrastructure/database/entities/tasks/Project.ts";
import { ProjectAutomation } from "@work-management/infrastructure/database/entities/tasks/ProjectAutomation.ts";
import { SavedView } from "@work-management/infrastructure/database/entities/tasks/SavedView.ts";
import { Sprint } from "@work-management/infrastructure/database/entities/tasks/Sprint.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { TaskComment } from "@work-management/infrastructure/database/entities/tasks/TaskComment.ts";
import { TaskRecurrenceRule } from "@work-management/infrastructure/database/entities/tasks/TaskRecurrenceRule.ts";
import { TaskRelationship } from "@work-management/infrastructure/database/entities/tasks/TaskRelationship.ts";
import { TaskStatus } from "@work-management/infrastructure/database/entities/tasks/TaskStatus.ts";
import { TaskTemplate } from "@work-management/infrastructure/database/entities/tasks/TaskTemplate.ts";
import { TaskWatcher } from "@work-management/infrastructure/database/entities/tasks/TaskWatcher.ts";
import { YjsSnapshot } from "@work-management/infrastructure/database/entities/tasks/YjsSnapshot.ts";

// knowledge-workspace owned entities
import { DocComment } from "@knowledge-workspace/infrastructure/database/entities/docs/DocComment.ts";
import { DocLink } from "@knowledge-workspace/infrastructure/database/entities/docs/DocLink.ts";
import { DocTemplate } from "@knowledge-workspace/infrastructure/database/entities/docs/DocTemplate.ts";
import { Document } from "@knowledge-workspace/infrastructure/database/entities/docs/Document.ts";
import { DocVersion } from "@knowledge-workspace/infrastructure/database/entities/docs/DocVersion.ts";
import { ContextSnapshot } from "@knowledge-workspace/infrastructure/database/entities/memory/ContextSnapshot.ts";
import { Memory } from "@knowledge-workspace/infrastructure/database/entities/memory/Memory.ts";
import { MemoryLink } from "@knowledge-workspace/infrastructure/database/entities/memory/MemoryLink.ts";
import { SavedSearch } from "@knowledge-workspace/infrastructure/database/entities/search/SavedSearch.ts";
import { SearchDocument } from "@knowledge-workspace/infrastructure/database/entities/search/SearchDocument.ts";

// execution-orchestration owned entities
import { AgentRun } from "@execution-orchestration/infrastructure/database/entities/orchestration/AgentRun.ts";
import { WorkflowDefinition } from "@execution-orchestration/infrastructure/database/entities/orchestration/WorkflowDefinition.ts";
import { AgentProfile } from "@execution-orchestration/infrastructure/database/entities/sandbox/AgentProfile.ts";
import { Artifact } from "@execution-orchestration/infrastructure/database/entities/sandbox/Artifact.ts";
import { Edge } from "@execution-orchestration/infrastructure/database/entities/sandbox/Edge.ts";
import { RoutingAudit } from "@execution-orchestration/infrastructure/database/entities/router/RoutingAudit.ts";
import { RoutingDraft } from "@execution-orchestration/infrastructure/database/entities/router/RoutingDraft.ts";
import { RoutingRule } from "@execution-orchestration/infrastructure/database/entities/router/RoutingRule.ts";

// integration-hub owned entities
import { BitbucketIssue } from "@integration-hub/infrastructure/database/entities/connectors/BitbucketIssue.ts";
import { BitbucketPullRequest } from "@integration-hub/infrastructure/database/entities/connectors/BitbucketPullRequest.ts";
import { ConnectorSyncLog } from "@integration-hub/infrastructure/database/entities/connectors/ConnectorSyncLog.ts";
import { GithubConnectorState } from "@integration-hub/infrastructure/database/entities/connectors/GithubConnectorState.ts";
import { GitlabIssue } from "@integration-hub/infrastructure/database/entities/connectors/GitlabIssue.ts";
import { GitlabMergeRequest } from "@integration-hub/infrastructure/database/entities/connectors/GitlabMergeRequest.ts";
import { Repo } from "@integration-hub/infrastructure/database/entities/repos/Repo.ts";
import { RepoBlameLine } from "@integration-hub/infrastructure/database/entities/repos/RepoBlameLine.ts";
import { RepoBranch } from "@integration-hub/infrastructure/database/entities/repos/RepoBranch.ts";
import { RepoCommit } from "@integration-hub/infrastructure/database/entities/repos/RepoCommit.ts";
import { RepoFilesIndex } from "@integration-hub/infrastructure/database/entities/repos/RepoFilesIndex.ts";
import { RepoTreeEntry } from "@integration-hub/infrastructure/database/entities/repos/RepoTreeEntry.ts";
import { ConnectorCredential } from "@integration-hub/infrastructure/database/entities/settings/ConnectorCredential.ts";

// notification-center owned entities
import { EventRetentionPolicy } from "@notification-center/infrastructure/database/entities/notifications/EventRetentionPolicy.ts";
import { Notification } from "@notification-center/infrastructure/database/entities/notifications/Notification.ts";
import { NotificationDelivery } from "@notification-center/infrastructure/database/entities/notifications/NotificationDelivery.ts";
import { NotificationMute } from "@notification-center/infrastructure/database/entities/notifications/NotificationMute.ts";
import { NotificationQuietHours } from "@notification-center/infrastructure/database/entities/notifications/NotificationQuietHours.ts";
import { NotificationRule } from "@notification-center/infrastructure/database/entities/notifications/NotificationRule.ts";
import { PushSubscription } from "@notification-center/infrastructure/database/entities/notifications/PushSubscription.ts";
import { Webhook } from "@notification-center/infrastructure/database/entities/notifications/Webhook.ts";
import { WebhookDelivery } from "@notification-center/infrastructure/database/entities/notifications/WebhookDelivery.ts";
import { WebhookRuleConfig } from "@notification-center/infrastructure/database/entities/notifications/WebhookRuleConfig.ts";

// agent-client-protocol owned entities
import { AcpSession } from "@agent-client-protocol/infrastructure/database/entities/AcpSession.ts";
import { AcpSessionCheckpoint } from "@agent-client-protocol/infrastructure/database/entities/AcpSessionCheckpoint.ts";

// workflow-coordination owned entities
import { ArtifactRetentionPolicy } from "@workflow-coordination/infrastructure/database/entities/artifacts/ArtifactRetentionPolicy.ts";
import { AuditEvent } from "@workflow-coordination/infrastructure/database/entities/audit/AuditEvent.ts";
import { AuditExport } from "@workflow-coordination/infrastructure/database/entities/audit/AuditExport.ts";

// EntitySchema entities — platform-core
import { FulcrumJobEntity } from "@platform-core/infrastructure/database/job-queue.entities.ts";
import { FulcrumErrorLogEntity } from "@platform-core/infrastructure/database/error-log.entities.ts";
import { FulcrumTelemetrySettingEntity, FulcrumTelemetryEventEntity } from "@platform-core/infrastructure/database/telemetry.entities.ts";
import { FulcrumThemeSettingEntity } from "@platform-core/infrastructure/database/theme-settings.entities.ts";
import { FulcrumCredentialEntity } from "@platform-core/infrastructure/database/credential.entities.ts";
import { FulcrumTenantSettingEntity } from "@platform-core/infrastructure/database/tenant-setting.entities.ts";
import { PlatformFeatureFlagEntity } from "../../../../feature-flags/src/infrastructure/database/entities/feature-flag.entities.ts";

// EntitySchema entities — identity-access
import { FulcrumInvitationEntity } from "@identity-access/infrastructure/database/invitation.entities.ts";
import { OrganizationMemberEntity } from "@identity-access/infrastructure/database/organization.entities.ts";

// EntitySchema entities — work-management
import {
  WorkManagementStateEntity,
  WorkManagementLabelEntity,
  WorkManagementTaskLabelEntity,
  WorkManagementCycleEntity,
  WorkManagementCycleTaskEntity,
  WorkManagementModuleEntity,
  WorkManagementModuleTaskEntity,
  WorkManagementSavedViewEntity,
  WorkManagementIntakeEntity,
  WorkManagementNotificationEntity,
  WorkManagementTaskCommentEntity,
  WorkManagementCommentReactionEntity,
  WorkManagementTaskWatcherEntity,
  WorkManagementTaskTemplateEntity,
  WorkManagementCustomFieldDefEntity,
  WorkManagementFieldDependencyRuleEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import { WorkManagementTaskRecurrenceRuleEntity } from "@work-management/infrastructure/database/task-recurrence.entities.ts";
import { WorkAutomationEntity } from "@work-management/infrastructure/database/automation.entities.ts";

// EntitySchema entities — knowledge-workspace
import {
  KnowledgeWorkspacePageEntity,
  KnowledgeWorkspacePageHistoryEntity,
  KnowledgeWorkspaceCommentEntity,
  KnowledgeWorkspaceAttachmentEntity,
  KnowledgeWorkspaceBacklinkEntity,
  KnowledgeWorkspaceCollaborationStateEntity,
  KnowledgeWorkspaceSearchEntryEntity,
  KnowledgeWorkspaceSavedSearchEntity,
} from "@knowledge-workspace/infrastructure/database/document.entities.ts";

// EntitySchema entities — execution-orchestration
import {
  FulcrumContextBundleEntity,
  FulcrumMemoryEntity,
  FulcrumMemoryLinkEntity,
  FulcrumRunEventEntity,
} from "@execution-orchestration/infrastructure/database/run-context.entities.ts";
import {
  FulcrumRoutingRuleEntity,
  FulcrumRoutingDraftEntity,
} from "@execution-orchestration/infrastructure/database/routing.entities.ts";

// EntitySchema entities — integration-hub
import {
  IntegrationRepositoryEntity,
  IntegrationRepositoryBranchEntity,
  IntegrationRepositoryCommitEntity,
} from "@integration-hub/infrastructure/database/repository.entities.ts";
import {
  IntegrationConnectorStateEntity,
  IntegrationConnectorRunEntity,
} from "@integration-hub/infrastructure/database/connector.entities.ts";
import {
  IntegrationWebhookEntity,
  IntegrationWebhookDeliveryEntity,
} from "@integration-hub/infrastructure/database/webhook.entities.ts";

// EntitySchema entities — notification-center
import {
  NotificationReadStateEntity,
  NotificationRuleSettingsEntity,
  NotificationQuietHoursSettingsEntity,
  NotificationPushSubscriptionEntity,
  NotificationChannelSettingsEntity,
  NotificationMuteEntity,
} from "@notification-center/infrastructure/database/notification.entities.ts";

// EntitySchema entities — workflow-coordination
import {
  WorkflowAuditEventEntity,
  WorkflowAuditRetentionPolicyEntity,
} from "@workflow-coordination/infrastructure/database/audit-log.entities.ts";
import {
  FulcrumWorkspaceEntity,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
  FulcrumTaskDependencyEntity,
  FulcrumDocumentEntity,
  FulcrumAcpSessionEntity,
  FulcrumAgentRunEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

// EntitySchema entities — planning-review
import {
  FulcrumArtifactEntity,
  FulcrumPlanEntity,
  FulcrumPlanPrototypeEntity,
  FulcrumReviewSessionEntity,
  FulcrumReviewAnnotationEntity,
  FulcrumUatSessionEntity,
  FulcrumGeneratedE2ETestEntity,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";

export const applicationMigrations = [
  CoreAndAuth1715788800000,
  WorkManagement1715788800001,
  Knowledge1715788800002,
  Orchestration1715788800003,
  Integration1715788800004,
  Notifications1715788800005,
  Platform1715788800006,
  WorkflowSpine1778623200001,
  ReviewWorkflow1778623200002,
  WorkManagement1778623200003,
  KnowledgeDocuments1778623200004,
  RunContext1778623200005,
  IntegrationRepositories1778623200006,
  Routing1778623200008,
  WorkflowAudit1778623200008,
  IdentityAccess1778623200009,
  Migration20260516AcpSessionColumns1778623200002,
  Migration20260519AcpSessionPauseResumeCheckpoints1778841600000,
  Migration20260517NotificationTraceColumn1778760600001,
  IntegrationWebhooks1778750700000,
  IntegrationConnectors1778751600000,
  WorkAutomations1778752500000,
  PlatformFeatureFlags1778753400000,
  Invitation1778757000000,
  TaskRecurrence1778760600000,
  Credential1778623200010,
  Telemetry1778755200000,
  ErrorLog1778758800000,
  NotificationReadState1778750400000,
  NotificationSettings1778750500000,
  ProjectStatuses20260523001778932800000,
];

export function createDataSourceOptions(
  extraEntities: (Function | EntitySchema)[] = [],
  env: Record<string, string | undefined> = process.env,
): DataSourceOptions {
  const database = resolveDatabaseConfig({ env });

  return {
    type: "postgres",
    ...(database.backend === "pglite"
      ? { driver: new PGliteDriver({ dataDir: database.dataDir }).driver, installExtensions: false }
      : { url: database.url }),
    entities: [...getCoreEntities(), ...extraEntities],
    migrations: applicationMigrations,
    migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
    synchronize: false,
    logging: env["TYPEORM_LOGGING"] === "true",
  };
}

export function resolveApplicationDatabaseRuntime(
  env: Record<string, string | undefined> = process.env,
): {
  backend: "pglite" | "postgres";
  source: "fulcrum-home" | "database-url";
  target: string;
  migrationsTableName: string;
  migrationCount: number;
  entityCount: number;
} {
  const database = resolveDatabaseConfig({ env });
  const entities = getCoreEntities();
  return {
    backend: database.backend,
    source: database.backend === "postgres" ? "database-url" : "fulcrum-home",
    target: database.backend === "postgres" ? database.url : database.dataDir,
    migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
    migrationCount: applicationMigrations.length,
    entityCount: entities.length,
  };
}

export function getCoreEntities(): (Function | EntitySchema)[] {
  return [
    // platform-core
    Event,
    CasbinRule,
    FlagNotificationRule,
    WebhookSubscription,
    ModelCache,
    ProviderCredential,
    Job,
    Credential,
    DomainEventOutbox,
    ErrorLog,
    ExperimentAssignment,
    FeatureFlagRollout,
    TelemetryEvent,
    TelemetryOutbox,
    FulcrumSkill,
    McpVirtualSkill,
    SkillConflict,
    SkillVersion,
    SchemaMigration,
    TenantSetting,
    // identity-access
    Account,
    FeatureFlag,
    Invitation,
    Org,
    OrgMember,
    Session,
    User,
    Verification,
    // work-management
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
    // knowledge-workspace
    DocComment,
    DocLink,
    DocTemplate,
    Document,
    DocVersion,
    ContextSnapshot,
    Memory,
    MemoryLink,
    SavedSearch,
    SearchDocument,
    // execution-orchestration
    AgentRun,
    WorkflowDefinition,
    AgentProfile,
    Artifact,
    Edge,
    RoutingAudit,
    RoutingDraft,
    RoutingRule,
    // agent-client-protocol
    AcpSession,
    AcpSessionCheckpoint,
    // integration-hub
    BitbucketIssue,
    BitbucketPullRequest,
    ConnectorSyncLog,
    GithubConnectorState,
    GitlabIssue,
    GitlabMergeRequest,
    Repo,
    RepoBlameLine,
    RepoBranch,
    RepoCommit,
    RepoFilesIndex,
    RepoTreeEntry,
    ConnectorCredential,
    // notification-center
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
    // workflow-coordination
    ArtifactRetentionPolicy,
    AuditEvent,
    AuditExport,
    // EntitySchema — platform-core
    FulcrumJobEntity,
    FulcrumErrorLogEntity,
    FulcrumTelemetrySettingEntity,
    FulcrumTelemetryEventEntity,
    FulcrumThemeSettingEntity,
    FulcrumCredentialEntity,
    FulcrumTenantSettingEntity,
    PlatformFeatureFlagEntity,
    // EntitySchema — identity-access
    FulcrumInvitationEntity,
    OrganizationMemberEntity,
    // EntitySchema — work-management
    WorkManagementStateEntity,
    WorkManagementLabelEntity,
    WorkManagementTaskLabelEntity,
    WorkManagementCycleEntity,
    WorkManagementCycleTaskEntity,
    WorkManagementModuleEntity,
    WorkManagementModuleTaskEntity,
    WorkManagementSavedViewEntity,
    WorkManagementIntakeEntity,
    WorkManagementNotificationEntity,
    WorkManagementTaskCommentEntity,
    WorkManagementCommentReactionEntity,
    WorkManagementTaskWatcherEntity,
    WorkManagementTaskTemplateEntity,
    WorkManagementCustomFieldDefEntity,
    WorkManagementFieldDependencyRuleEntity,
    WorkManagementTaskRecurrenceRuleEntity,
    WorkAutomationEntity,
    // EntitySchema — knowledge-workspace
    KnowledgeWorkspacePageEntity,
    KnowledgeWorkspacePageHistoryEntity,
    KnowledgeWorkspaceCommentEntity,
    KnowledgeWorkspaceAttachmentEntity,
    KnowledgeWorkspaceBacklinkEntity,
    KnowledgeWorkspaceCollaborationStateEntity,
    KnowledgeWorkspaceSearchEntryEntity,
    KnowledgeWorkspaceSavedSearchEntity,
    // EntitySchema — execution-orchestration
    FulcrumContextBundleEntity,
    FulcrumMemoryEntity,
    FulcrumMemoryLinkEntity,
    FulcrumRunEventEntity,
    FulcrumRoutingRuleEntity,
    FulcrumRoutingDraftEntity,
    // EntitySchema — integration-hub
    IntegrationRepositoryEntity,
    IntegrationRepositoryBranchEntity,
    IntegrationRepositoryCommitEntity,
    IntegrationConnectorStateEntity,
    IntegrationConnectorRunEntity,
    IntegrationWebhookEntity,
    IntegrationWebhookDeliveryEntity,
    // EntitySchema — notification-center
    NotificationReadStateEntity,
    NotificationRuleSettingsEntity,
    NotificationQuietHoursSettingsEntity,
    NotificationPushSubscriptionEntity,
    NotificationChannelSettingsEntity,
    NotificationMuteEntity,
    // EntitySchema — workflow-coordination
    WorkflowAuditEventEntity,
    WorkflowAuditRetentionPolicyEntity,
    FulcrumWorkspaceEntity,
    FulcrumProjectEntity,
    FulcrumTaskEntity,
    FulcrumTaskDependencyEntity,
    FulcrumDocumentEntity,
    FulcrumAcpSessionEntity,
    FulcrumAgentRunEntity,
    // EntitySchema — planning-review
    FulcrumArtifactEntity,
    FulcrumPlanEntity,
    FulcrumPlanPrototypeEntity,
    FulcrumReviewSessionEntity,
    FulcrumReviewAnnotationEntity,
    FulcrumUatSessionEntity,
    FulcrumGeneratedE2ETestEntity,
  ];
}

let defaultDataSource: DataSource | undefined;

export async function initDataSource(
  options?: Partial<DataSourceOptions>,
): Promise<DataSource> {
  if (defaultDataSource?.isInitialized) return defaultDataSource;
  const config = resolveDatabaseConfig();
  if (config.backend === "pglite") {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(config.dataDir, { recursive: true });
    await assertPgliteLockRecoverable(config.dataDir);
  }
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
