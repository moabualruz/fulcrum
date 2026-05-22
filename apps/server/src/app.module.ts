import "reflect-metadata";

import { Module } from "@nestjs/common";

import { ApplicationDatabaseModule } from "@platform-core/infrastructure/database/typeorm-root.module.ts";
import { EventBusModule } from "@platform-core/application/event-bus/index.ts";
import { CredentialPublicApiModule } from "@platform-core/interface/http/credential-public-api.controller.ts";
import { DoctorPublicApiModule } from "@platform-core/interface/http/doctor-public-api.controller.ts";
import { FeatureExperimentPublicApiModule } from "@feature-flags/interface/http/controllers/feature-experiment-public-api.controller.ts";
import { FeatureFlagPublicApiModule } from "@feature-flags/interface/http/controllers/feature-flag-public-api.controller.ts";
import { ErrorLogPublicApiModule } from "@platform-core/interface/http/error-log-public-api.controller.ts";
import { InferencePublicApiModule } from "@platform-core/interface/http/inference-public-api.controller.ts";
import { SkillSupplyPublicApiModule } from "@platform-core/interface/http/skill-supply-public-api.controller.ts";
import { SettingsPublicApiModule } from "@platform-core/interface/http/settings-public-api.controller.ts";
import { SubscriptionEventStreamModule } from "@platform-core/interface/http/subscription-event-stream.controller.ts";
import { TelemetryPublicApiModule } from "@platform-core/interface/http/telemetry-public-api.controller.ts";
import { ThemeSettingsApiModule } from "@platform-core/interface/http/theme-settings.controller.ts";
import { AuthPublicApiModule } from "@identity-access/interface/http/auth-public-api.controller.ts";
import { InvitationPublicApiModule } from "@identity-access/interface/http/invitation-public-api.controller.ts";
import { OrganizationPublicApiModule } from "@identity-access/interface/http/organization-public-api.controller.ts";
import { AgentRunPublicApiModule } from "@execution-orchestration/interface/http/agent-run-public-api.controller.ts";
import { RoutingPublicApiModule } from "@execution-orchestration/interface/http/routing-public-api.controller.ts";
import { ConnectorPublicApiModule } from "@integration-hub/interface/http/connector-public-api.controller.ts";
import { DataPortabilityPublicApiModule } from "@integration-hub/interface/http/data-portability-public-api.controller.ts";
import { RepositoryPublicApiModule } from "@integration-hub/interface/http/repository-public-api.controller.ts";
import { WebhookPublicApiModule } from "@integration-hub/interface/http/webhook-public-api.controller.ts";
import { DocumentPublicApiModule } from "@knowledge-workspace/interface/http/document-public-api.controller.ts";
import { MemoryPublicApiModule } from "@knowledge-workspace/interface/http/memory-public-api.controller.ts";
import { SearchPublicApiModule } from "@knowledge-workspace/interface/http/search-public-api.controller.ts";
import { NotificationPublicApiModule } from "@notification-center/interface/http/notification-public-api.controller.ts";
import { AuditPublicApiModule } from "@workflow-coordination/interface/http/audit-public-api.controller.ts";
import { ArtifactPublicApiModule } from "@workflow-coordination/interface/http/artifact-public-api.controller.ts";
import { ReportPublicApiModule } from "@work-management/interface/http/report-public-api.controller.ts";
import { RelationshipPublicApiModule } from "@work-management/interface/http/relationship-public-api.controller.ts";
import { SavedViewPublicApiModule } from "@work-management/interface/http/saved-view-public-api.controller.ts";
import { AutomationPublicApiModule } from "@work-management/interface/http/automation-public-api.controller.ts";
import { CustomFieldPublicApiModule } from "@work-management/interface/http/custom-field-public-api.controller.ts";
import { FieldDependencyPublicApiModule } from "@work-management/interface/http/field-dependency-public-api.controller.ts";
import { PlanningStructurePublicApiModule } from "@work-management/interface/http/planning-structure-public-api.controller.ts";
import { ProjectPublicApiModule } from "@work-management/interface/http/project-public-api.controller.ts";
import { ProjectStatusPublicApiModule } from "@work-management/interface/http/project-status-public-api.controller.ts";
import { SprintPublicApiModule } from "@work-management/interface/http/sprint-public-api.controller.ts";
import { TaskCommentPublicApiModule } from "@work-management/interface/http/task-comment-public-api.controller.ts";
import { TaskRecurrencePublicApiModule } from "@work-management/interface/http/task-recurrence-public-api.controller.ts";
import { TemplatePublicApiModule } from "@work-management/interface/http/template-public-api.controller.ts";
import { TaskPublicApiModule } from "@work-management/interface/http/task-public-api.controller.ts";
import { WorkflowSettingsPublicApiModule } from "@work-management/interface/http/workflow-settings-public-api.controller.ts";
import { WorkflowCycleModule } from "@workflow-coordination/interface/http/workflow-cycle.module.ts";
import { TrpcModule } from "./trpc/trpc.module.ts";

export class AppModule {}

Module({
  imports: [
    TrpcModule,
    EventBusModule,
    ApplicationDatabaseModule,
    CredentialPublicApiModule,
    DoctorPublicApiModule,
    FeatureExperimentPublicApiModule,
    FeatureFlagPublicApiModule,
    ErrorLogPublicApiModule,
    InferencePublicApiModule,
    SkillSupplyPublicApiModule,
    SettingsPublicApiModule,
    SubscriptionEventStreamModule,
    TelemetryPublicApiModule,
    ThemeSettingsApiModule,
    AuthPublicApiModule,
    InvitationPublicApiModule,
    OrganizationPublicApiModule,
    AgentRunPublicApiModule,
    RoutingPublicApiModule,
    ConnectorPublicApiModule,
    DataPortabilityPublicApiModule,
    RepositoryPublicApiModule,
    WebhookPublicApiModule,
    DocumentPublicApiModule,
    MemoryPublicApiModule,
    SearchPublicApiModule,
    NotificationPublicApiModule,
    AuditPublicApiModule,
    ArtifactPublicApiModule,
    ReportPublicApiModule,
    RelationshipPublicApiModule,
    SavedViewPublicApiModule,
    AutomationPublicApiModule,
    CustomFieldPublicApiModule,
    FieldDependencyPublicApiModule,
    PlanningStructurePublicApiModule,
    ProjectPublicApiModule,
    ProjectStatusPublicApiModule,
    SprintPublicApiModule,
    TaskCommentPublicApiModule,
    TaskRecurrencePublicApiModule,
    TemplatePublicApiModule,
    TaskPublicApiModule,
    WorkflowSettingsPublicApiModule,
    WorkflowCycleModule,
  ],
})(AppModule);
