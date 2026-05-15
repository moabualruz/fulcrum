import "reflect-metadata";

import { Global, Module } from "@nestjs/common";
import {
  TypeOrmModule,
  type TypeOrmModuleAsyncOptions,
  type TypeOrmModuleOptions,
} from "@nestjs/typeorm";
import type { DataSourceOptions } from "typeorm";

import {
  type FulcrumTypeOrmOptions,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { FulcrumTypeOrmConnectionRuntime } from "@platform-core/infrastructure/database/typeorm-connection-runtime.ts";
import { getCoreEntities } from "../application-database/typeorm.config.ts";

// Platform-core owned repositories (kept here)
import { EventRepository } from "../application-database/repositories/core/EventRepository.ts";
import { TenantSettingRepository } from "../application-database/repositories/TenantSettingRepository.ts";
import { JobRepository } from "../application-database/repositories/jobs/JobRepository.ts";
import { FulcrumSkillRepository } from "../application-database/repositories/skills/FulcrumSkillRepository.ts";
import { ModelCacheRepository } from "../application-database/repositories/inference/ModelCacheRepository.ts";
import { ProviderCredentialRepository } from "../application-database/repositories/inference/ProviderCredentialRepository.ts";
import { CasbinRuleRepository } from "../application-database/repositories/flags/CasbinRuleRepository.ts";
import { WebhookSubscriptionRepository } from "../application-database/repositories/flags/WebhookSubscriptionRepository.ts";
import { NotificationRuleRepository } from "../application-database/repositories/flags/NotificationRuleRepository.ts";
import { SchemaMigrationRepository } from "../application-database/repositories/SchemaMigrationRepository.ts";
import { CredentialRepository } from "../application-database/repositories/platform/CredentialRepository.ts";
import { ErrorLogRepository } from "../application-database/repositories/platform/ErrorLogRepository.ts";
import { ExperimentAssignmentRepository } from "../application-database/repositories/platform/ExperimentAssignmentRepository.ts";
import { FeatureFlagRolloutRepository } from "../application-database/repositories/platform/FeatureFlagRolloutRepository.ts";
import { TelemetryEventRepository } from "../application-database/repositories/platform/TelemetryEventRepository.ts";

// identity-access owned repositories
import { OrgRepository } from "@identity-access/infrastructure/database/repositories/auth/OrgRepository.ts";
import { UserRepository } from "@identity-access/infrastructure/database/repositories/auth/UserRepository.ts";
import { SessionRepository } from "@identity-access/infrastructure/database/repositories/auth/SessionRepository.ts";
import { AccountRepository } from "@identity-access/infrastructure/database/repositories/auth/AccountRepository.ts";
import { VerificationRepository } from "@identity-access/infrastructure/database/repositories/auth/VerificationRepository.ts";
import { InvitationRepository } from "@identity-access/infrastructure/database/repositories/auth/InvitationRepository.ts";
import { OrgMemberRepository } from "@identity-access/infrastructure/database/repositories/auth/OrgMemberRepository.ts";
import { FeatureFlagRepository } from "@identity-access/infrastructure/database/repositories/auth/FeatureFlagRepository.ts";

// work-management owned repositories
import { TaskRepository } from "@work-management/infrastructure/database/repositories/tasks/TaskRepository.ts";
import { SprintRepository } from "@work-management/infrastructure/database/repositories/tasks/SprintRepository.ts";

// knowledge-workspace owned repositories
import { DocumentRepository } from "@knowledge-workspace/infrastructure/database/repositories/docs/DocumentRepository.ts";
import { DocLinkRepository } from "@knowledge-workspace/infrastructure/database/repositories/docs/DocLinkRepository.ts";
import { DocVersionRepository } from "@knowledge-workspace/infrastructure/database/repositories/docs/DocVersionRepository.ts";
import { DocCommentRepository } from "@knowledge-workspace/infrastructure/database/repositories/docs/DocCommentRepository.ts";
import { DocTemplateRepository } from "@knowledge-workspace/infrastructure/database/repositories/docs/DocTemplateRepository.ts";
import { MemoryRepository } from "@knowledge-workspace/infrastructure/database/repositories/memory/MemoryRepository.ts";
import { SearchDocumentRepository } from "@knowledge-workspace/infrastructure/database/repositories/search/SearchDocumentRepository.ts";

// execution-orchestration owned repositories
import { AgentRunRepository } from "@execution-orchestration/infrastructure/database/repositories/orchestration/AgentRunRepository.ts";
import { WorkflowDefinitionRepository } from "@execution-orchestration/infrastructure/database/repositories/orchestration/WorkflowDefinitionRepository.ts";
import { RoutingRuleRepository } from "@execution-orchestration/infrastructure/database/repositories/router/RoutingRuleRepository.ts";
import { AgentProfileRepository } from "@execution-orchestration/infrastructure/database/repositories/sandbox/AgentProfileRepository.ts";
import { EdgeRepository } from "@execution-orchestration/infrastructure/database/repositories/sandbox/EdgeRepository.ts";

// integration-hub owned repositories
import { RepoRepository } from "@integration-hub/infrastructure/database/repositories/repos/RepoRepository.ts";

// workflow-coordination owned repositories
import { ArtifactRepository } from "@workflow-coordination/infrastructure/database/repositories/artifacts/ArtifactRepository.ts";

export const ALL_REPOSITORIES = [
  // platform-core
  EventRepository,
  TenantSettingRepository,
  JobRepository,
  FulcrumSkillRepository,
  ModelCacheRepository,
  ProviderCredentialRepository,
  CasbinRuleRepository,
  WebhookSubscriptionRepository,
  NotificationRuleRepository,
  SchemaMigrationRepository,
  CredentialRepository,
  ErrorLogRepository,
  ExperimentAssignmentRepository,
  FeatureFlagRolloutRepository,
  TelemetryEventRepository,
  // identity-access
  OrgRepository,
  UserRepository,
  SessionRepository,
  AccountRepository,
  VerificationRepository,
  InvitationRepository,
  OrgMemberRepository,
  FeatureFlagRepository,
  // work-management
  TaskRepository,
  SprintRepository,
  // knowledge-workspace
  DocumentRepository,
  DocLinkRepository,
  DocVersionRepository,
  DocCommentRepository,
  DocTemplateRepository,
  MemoryRepository,
  SearchDocumentRepository,
  // execution-orchestration
  AgentRunRepository,
  WorkflowDefinitionRepository,
  RoutingRuleRepository,
  AgentProfileRepository,
  EdgeRepository,
  // integration-hub
  RepoRepository,
  // workflow-coordination
  ArtifactRepository,
] as const;

// Re-export repositories for consumers
export {
  OrgRepository,
  UserRepository,
  SessionRepository,
  AccountRepository,
  VerificationRepository,
  InvitationRepository,
  OrgMemberRepository,
  FeatureFlagRepository,
  EventRepository,
  TenantSettingRepository,
  TaskRepository,
  SprintRepository,
  DocumentRepository,
  DocLinkRepository,
  DocVersionRepository,
  DocCommentRepository,
  DocTemplateRepository,
  MemoryRepository,
  AgentRunRepository,
  WorkflowDefinitionRepository,
  RoutingRuleRepository,
  ArtifactRepository,
  AgentProfileRepository,
  EdgeRepository,
  RepoRepository,
  JobRepository,
  SearchDocumentRepository,
  FulcrumSkillRepository,
  ModelCacheRepository,
  ProviderCredentialRepository,
  CasbinRuleRepository,
  WebhookSubscriptionRepository,
  NotificationRuleRepository,
  SchemaMigrationRepository,
  CredentialRepository,
  ErrorLogRepository,
  ExperimentAssignmentRepository,
  FeatureFlagRolloutRepository,
  TelemetryEventRepository,
};

export type FulcrumTypeOrmModuleOptions = FulcrumTypeOrmOptions & TypeOrmModuleOptions & {
  autoLoadEntities: true;
};

export interface CreateFulcrumTypeOrmModuleOptionsInput {
  env?: Record<string, string | undefined>;
  entities?: NonNullable<DataSourceOptions["entities"]>;
  migrations?: NonNullable<DataSourceOptions["migrations"]>;
}

export async function createFulcrumTypeOrmModuleOptions(
  input: CreateFulcrumTypeOrmModuleOptionsInput = {},
  runtime = new FulcrumTypeOrmConnectionRuntime(),
): Promise<FulcrumTypeOrmModuleOptions> {
  const options = await runtime.createOptions({
    env: input.env,
    entities: input.entities ?? [],
    migrations: input.migrations ?? [],
  });

  return {
    ...options,
    autoLoadEntities: true,
  };
}

export const fulcrumTypeOrmAsyncOptions = {
  imports: [],
  inject: [FulcrumTypeOrmConnectionRuntime],
  useFactory: (runtime: FulcrumTypeOrmConnectionRuntime) =>
    createFulcrumTypeOrmModuleOptions({}, runtime),
  extraProviders: [FulcrumTypeOrmConnectionRuntime],
} satisfies TypeOrmModuleAsyncOptions;

export const fulcrumTypeOrmRootModule = TypeOrmModule.forRootAsync(
  fulcrumTypeOrmAsyncOptions,
);

export class ApplicationDatabaseModule {}

Global()(ApplicationDatabaseModule);
Module({
  imports: [
    fulcrumTypeOrmRootModule,
    TypeOrmModule.forFeature(getCoreEntities()),
  ],
  providers: [...ALL_REPOSITORIES],
  exports: [TypeOrmModule, ...ALL_REPOSITORIES],
})(ApplicationDatabaseModule);
