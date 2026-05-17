import { EntitySchema } from "typeorm";

export interface FulcrumArtifact {
  id: string;
  projectId: string;
  traceId: string;
  runId: string | null;
  taskId: string | null;
  docId: string | null;
  kind: string;
  title: string;
  filename: string | null;
  bodyPath: string | null;
  checksumSha256: string | null;
  mime: string | null;
  sizeBytes: string;
  lifecycleState: string;
  metadataJson: Record<string, unknown>;
  archived: boolean;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumPlan {
  id: string;
  projectId: string;
  traceId: string;
  title: string;
  planMd: string;
  status: string;
  sourceDocId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumPlanPrototype {
  id: string;
  planId: string;
  artifactId: string | null;
  kind: string;
  title: string;
  status: string;
  outputRef: string | null;
  metadata: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumReviewSession {
  id: string;
  projectId: string;
  traceId: string;
  reviewType: string;
  subjectId: string;
  status: string;
  revision: number;
  summary: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumReviewAnnotation {
  id: string;
  reviewSessionId: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  severity: string;
  body: string;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumUatSession {
  id: string;
  projectId: string;
  traceId: string;
  status: string;
  finalQaEventId: string | null;
  approvedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumGeneratedE2ETest {
  id: string;
  projectId: string;
  traceId: string;
  sourceUatSessionId: string;
  runner: string;
  filePath: string;
  status: string;
  bodyMd: string;
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

export const FulcrumArtifactEntity = new EntitySchema<FulcrumArtifact>({
  name: "FulcrumArtifact",
  tableName: "fulcrum_artifacts",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    runId: { name: "run_id", type: "varchar", length: 128, nullable: true },
    taskId: { name: "task_id", type: "varchar", length: 128, nullable: true },
    docId: { name: "doc_id", type: "varchar", length: 128, nullable: true },
    kind: { type: "varchar", length: 80 },
    title: { type: "varchar", length: 320 },
    filename: { type: "varchar", length: 320, nullable: true },
    bodyPath: { name: "body_path", type: "text", nullable: true },
    checksumSha256: { name: "checksum_sha256", type: "varchar", length: 96, nullable: true },
    mime: { type: "varchar", length: 160, nullable: true },
    sizeBytes: { name: "size_bytes", type: "bigint", default: "0" },
    lifecycleState: { name: "lifecycle_state", type: "varchar", length: 80, default: "created" },
    metadataJson: {
      name: "metadata_json",
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    archived: { type: "boolean", default: false },
    archivedAt: { name: "archived_at", type: "timestamptz", nullable: true },
    deletedAt: { name: "deleted_at", type: "timestamptz", nullable: true },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_artifacts_project_kind_idx", columns: ["projectId", "kind"] },
    { name: "fulcrum_artifacts_project_lifecycle_idx", columns: ["projectId", "lifecycleState"] },
    { name: "fulcrum_artifacts_trace_idx", columns: ["traceId"] },
    { name: "fulcrum_artifacts_archive_idx", columns: ["projectId", "archived"] },
  ],
});

export const FulcrumPlanEntity = new EntitySchema<FulcrumPlan>({
  name: "FulcrumPlan",
  tableName: "fulcrum_plans",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    title: { type: "varchar", length: 320 },
    planMd: { name: "plan_md", type: "text" },
    status: { type: "varchar", length: 80 },
    sourceDocId: { name: "source_doc_id", type: "varchar", length: 128, nullable: true },
    ...timestampColumns,
  },
  indices: [{ name: "fulcrum_plans_project_status_idx", columns: ["projectId", "status"] }],
});

export const FulcrumPlanPrototypeEntity = new EntitySchema<FulcrumPlanPrototype>({
  name: "FulcrumPlanPrototype",
  tableName: "fulcrum_plan_prototypes",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    planId: { name: "plan_id", type: "varchar", length: 128 },
    artifactId: { name: "artifact_id", type: "varchar", length: 128, nullable: true },
    kind: { type: "varchar", length: 80 },
    title: { type: "varchar", length: 320 },
    status: { type: "varchar", length: 80 },
    outputRef: { name: "output_ref", type: "text", nullable: true },
    metadata: {
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    ...timestampColumns,
  },
  indices: [{ name: "fulcrum_plan_prototypes_plan_status_idx", columns: ["planId", "status"] }],
});

export const FulcrumReviewSessionEntity = new EntitySchema<FulcrumReviewSession>({
  name: "FulcrumReviewSession",
  tableName: "fulcrum_review_sessions",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    reviewType: { name: "review_type", type: "varchar", length: 80 },
    subjectId: { name: "subject_id", type: "varchar", length: 128 },
    status: { type: "varchar", length: 80 },
    revision: { type: "integer" },
    summary: {
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_review_sessions_project_type_idx", columns: ["projectId", "reviewType"] },
    { name: "fulcrum_review_sessions_trace_idx", columns: ["traceId"] },
  ],
});

export const FulcrumReviewAnnotationEntity = new EntitySchema<FulcrumReviewAnnotation>({
  name: "FulcrumReviewAnnotation",
  tableName: "fulcrum_review_annotations",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    reviewSessionId: { name: "review_session_id", type: "varchar", length: 128 },
    filePath: { name: "file_path", type: "text" },
    lineStart: { name: "line_start", type: "integer" },
    lineEnd: { name: "line_end", type: "integer" },
    severity: { type: "varchar", length: 80 },
    body: { type: "text" },
    status: { type: "varchar", length: 80 },
    ...timestampColumns,
  },
  indices: [
    {
      name: "fulcrum_review_annotations_session_status_idx",
      columns: ["reviewSessionId", "status"],
    },
  ],
});

export const FulcrumUatSessionEntity = new EntitySchema<FulcrumUatSession>({
  name: "FulcrumUatSession",
  tableName: "fulcrum_uat_sessions",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    status: { type: "varchar", length: 80 },
    finalQaEventId: { name: "final_qa_event_id", type: "varchar", length: 128, nullable: true },
    approvedAt: { name: "approved_at", type: "timestamptz", nullable: true },
    ...timestampColumns,
  },
  indices: [{ name: "fulcrum_uat_sessions_project_status_idx", columns: ["projectId", "status"] }],
});

export const FulcrumGeneratedE2ETestEntity = new EntitySchema<FulcrumGeneratedE2ETest>({
  name: "FulcrumGeneratedE2ETest",
  tableName: "fulcrum_generated_e2e_tests",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    sourceUatSessionId: { name: "source_uat_session_id", type: "varchar", length: 128 },
    runner: { type: "varchar", length: 80 },
    filePath: { name: "file_path", type: "text" },
    status: { type: "varchar", length: 80 },
    bodyMd: { name: "body_md", type: "text" },
    ...timestampColumns,
  },
  indices: [
    {
      name: "fulcrum_generated_e2e_tests_project_status_idx",
      columns: ["projectId", "status"],
    },
  ],
});

export const FULCRUM_REVIEW_WORKFLOW_ENTITIES = [
  FulcrumArtifactEntity,
  FulcrumPlanEntity,
  FulcrumPlanPrototypeEntity,
  FulcrumReviewSessionEntity,
  FulcrumReviewAnnotationEntity,
  FulcrumUatSessionEntity,
  FulcrumGeneratedE2ETestEntity,
];
