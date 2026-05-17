import { migration as migration0001ProductKernel } from "./0001_product_kernel.ts";
import { migration as migration0002Search } from "./0002_search.ts";
import { migration as migration0003Jobs } from "./0003_jobs.ts";
import { migration as migration0004AgentProfiles } from "./0004_agent_profiles.ts";
import { migration as migration0004AgentRunsRetryStall } from "./0004_agent_runs_retry_stall.ts";
import { migration as migration0004ArtifactsMetadataJson } from "./0004_artifacts_metadata_json.ts";
import { migration as migration0004ConnectorSync } from "./0004_connector_sync.ts";
import { migration as migration0004Connectors } from "./0004_connectors.ts";
import { migration as migration0004DocEmbedding } from "./0004_doc_embedding.ts";
import { migration as migration0004DocTreeVersionsLinks } from "./0004_doc_tree_versions_links.ts";
import { migration as migration0004DocsExtensions } from "./0004_docs_extensions.ts";
import { migration as migration0004Embeddings } from "./0004_embeddings.ts";
import { migration as migration0004EmbeddingsSprints } from "./0004_embeddings_sprints.ts";
import { migration as migration0004EventRetentionPolicies } from "./0004_event_retention_policies.ts";
import { migration as migration0004GithubConnector } from "./0004_github_connector.ts";
import { migration as migration0004InboxAudit } from "./0004_inbox_audit.ts";
import { migration as migration0004Marketplace } from "./0004_marketplace.ts";
import { migration as migration0004Notifications } from "./0004_notifications.ts";
import { migration as migration0004Orchestration } from "./0004_orchestration.ts";
import { migration as migration0004ProjectSettings } from "./0004_project_settings.ts";
import { migration as migration0004PushSubscriptions } from "./0004_push_subscriptions.ts";
import { migration as migration0004RepoFiles } from "./0004_repo_files.ts";
import { migration as migration0004RepoSync } from "./0004_repo_sync.ts";
import { migration as migration0004ReposColumnsAndTaskRepoFk } from "./0004_repos_columns_and_task_repo_fk.ts";
import { migration as migration0004Settings } from "./0004_settings.ts";
import { migration as migration0004SettingsConnectorsCredentials } from "./0004_settings_connectors_credentials.ts";
import { migration as migration0004Skills } from "./0004_skills.ts";
import { migration as migration0004Sprints } from "./0004_sprints.ts";
import { migration as migration0004SprintsAndMetrics } from "./0004_sprints_and_metrics.ts";
import { migration as migration0004SprintsAndTaskFields } from "./0004_sprints_and_task_fields.ts";
import { migration as migration0004SprintsApiKeys } from "./0004_sprints_api_keys.ts";
import { migration as migration0004SprintsMetricsCache } from "./0004_sprints_metrics_cache.ts";
import { migration as migration0004Symphony } from "./0004_symphony.ts";
import { migration as migration0004TenantSettings } from "./0004_tenant_settings.ts";
import { migration as migration0004Users } from "./0004_users.ts";
import { migration as migration0005Artifacts } from "./0005_artifacts.ts";
import { migration as migration0005BitbucketConnector } from "./0005_bitbucket_connector.ts";
import { migration as migration0005GitlabConnector } from "./0005_gitlab_connector.ts";
import { migration as migration0005SprintRetro } from "./0005_sprint_retro.ts";
import { migration as migration0006SearchExtended } from "./0006_search_extended.ts";
import { migration as migration0007SearchClicksExtended } from "./0007_search_clicks_extended.ts";
import { migration as migration0008SavedViewsCompat } from "./0008_saved_views_compat.ts";
import { migration as migration0009ProjectSetup } from "./0009_project_setup.ts";
import { migration as migration0010TaskSoftDelete } from "./0010_task_soft_delete.ts";
import { migration as migration0011MetricsCacheReportColumns } from "./0011_metrics_cache_report_columns.ts";

export type { ProductStoreMigration } from "./types.ts";

export const productStoreMigrations = [
  migration0001ProductKernel,
  migration0002Search,
  migration0003Jobs,
  migration0004AgentProfiles,
  migration0004AgentRunsRetryStall,
  migration0004ArtifactsMetadataJson,
  migration0004ConnectorSync,
  migration0004Connectors,
  migration0004DocEmbedding,
  migration0004DocTreeVersionsLinks,
  migration0004DocsExtensions,
  migration0004Embeddings,
  migration0004EmbeddingsSprints,
  migration0004EventRetentionPolicies,
  migration0004GithubConnector,
  migration0004InboxAudit,
  migration0004Marketplace,
  migration0004Notifications,
  migration0004Orchestration,
  migration0004ProjectSettings,
  migration0004PushSubscriptions,
  migration0004RepoFiles,
  migration0004RepoSync,
  migration0004ReposColumnsAndTaskRepoFk,
  migration0004Settings,
  migration0004SettingsConnectorsCredentials,
  migration0004Skills,
  migration0004Sprints,
  migration0004SprintsAndMetrics,
  migration0004SprintsAndTaskFields,
  migration0004SprintsApiKeys,
  migration0004SprintsMetricsCache,
  migration0004Symphony,
  migration0004TenantSettings,
  migration0004Users,
  migration0005Artifacts,
  migration0005BitbucketConnector,
  migration0005GitlabConnector,
  migration0005SprintRetro,
  migration0006SearchExtended,
  migration0007SearchClicksExtended,
  migration0008SavedViewsCompat,
  migration0009ProjectSetup,
  migration0010TaskSoftDelete,
  migration0011MetricsCacheReportColumns,
] as const;
