import { existsSync } from "node:fs";
import path from "node:path";
import type { ComplianceRequirement } from "@fulcrum/shared";
import type { ComplianceAuditResult, ComplianceEvidenceIndex } from "./compliance-service.js";

interface EvidenceGroup {
  implementationRefs: string[];
  testRefs: string[];
  evidenceRefs?: string[];
}

export type EvidenceGroupId =
  | "compliance"
  | "product"
  | "tech"
  | "project"
  | "plane"
  | "task"
  | "run"
  | "agent"
  | "mcp"
  | "memory"
  | "code"
  | "context"
  | "worktree"
  | "quality"
  | "artifact"
  | "policy"
  | "doctor"
  | "backup"
  | "release"
  | "cockpit"
  | "graph"
  | "setup"
  | "security"
  | "performance"
  | "adapter";

const evidenceGroups: Record<EvidenceGroupId, EvidenceGroup> = {
  compliance: {
    implementationRefs: [
      "packages/core/src/readiness/compliance-extractor.ts",
      "packages/core/src/readiness/compliance-service.ts",
      "packages/core/src/readiness/compliance-evidence.ts",
      "apps/cli/src/commands/compliance.ts",
      "apps/server/src/routes/compliance.ts",
      "apps/cockpit/src/routes/compliance.tsx",
      "docs/operator-guide.md"
    ],
    testRefs: [
      "tests/contract/compliance-contract.test.ts",
      "tests/integration/compliance-source-order.test.ts",
      "tests/policy/compliance-release-gate.test.ts"
    ],
    evidenceRefs: ["specs/005-product-readiness-gap-closure/contracts/compliance-contract.md"]
  },
  product: {
    implementationRefs: [
      "README.md",
      "docs/operator-guide.md",
      "docs/architecture.md",
      "apps/cli/src/main.ts",
      "apps/server/src/main.ts",
      "apps/cockpit/src/App.tsx",
      "apps/tui/src/main.ts"
    ],
    testRefs: [
      "tests/contract/cli-full-srs-commands.test.ts",
      "tests/integration/cross-surface-parity.test.ts",
      "tests/e2e/quickstart/release-readiness.sh"
    ]
  },
  tech: {
    implementationRefs: [
      "package.json",
      "pnpm-workspace.yaml",
      "tsconfig.base.json",
      "packages/shared/src/contracts/index.ts",
      "packages/db/migrations/0001_initial.sql",
      "packages/db/migrations/0002_readiness.sql",
      "packages/mcp/src/tools.ts"
    ],
    testRefs: [
      "tests/contract/shared-contracts.test.ts",
      "tests/contract/mcp-tools.test.ts",
      "tests/integration/sqlite-surface-parity.test.ts"
    ]
  },
  project: {
    implementationRefs: [
      "packages/core/src/projects/service.ts",
      "apps/cli/src/commands/project.ts",
      "apps/server/src/routes/projects.ts",
      "apps/cockpit/src/routes/project-board.tsx"
    ],
    testRefs: [
      "tests/contract/project-registry.test.ts",
      "tests/integration/project-cockpit-parity.test.ts",
      "tests/integration/local-task-workflow.test.ts"
    ]
  },
  plane: {
    implementationRefs: [
      "packages/core/src/external-pm/service.ts",
      "packages/plane/src/plane-adapter.ts",
      "packages/plane/src/simulated-adapter.ts",
      "apps/cli/src/commands/plane.ts",
      "apps/server/src/routes/external-pm.ts"
    ],
    testRefs: [
      "tests/contract/external-pm-adapter.test.ts",
      "tests/integration/plane-mirror-sync.test.ts",
      "tests/integration/plane-full-acceptance.test.ts",
      "tests/integration/plane-adapter-certification.test.ts"
    ]
  },
  task: {
    implementationRefs: [
      "packages/core/src/tasks/service.ts",
      "apps/cli/src/commands/task.ts",
      "apps/server/src/routes/tasks.ts",
      "packages/mcp/src/tools.ts"
    ],
    testRefs: [
      "tests/integration/local-task-workflow.test.ts",
      "tests/contract/mcp-tools.test.ts",
      "tests/integration/cockpit-owned-workflow.spec.ts"
    ]
  },
  run: {
    implementationRefs: [
      "packages/core/src/runs/service.ts",
      "packages/core/src/runs/log-capture.ts",
      "apps/cli/src/commands/run.ts",
      "apps/server/src/routes/runs.ts"
    ],
    testRefs: [
      "tests/contract/run-lifecycle.test.ts",
      "tests/integration/run-cancel.test.ts",
      "tests/recovery/run-stale-crash.test.ts",
      "tests/e2e/release-acceptance-operator-review.spec.ts"
    ]
  },
  agent: {
    implementationRefs: [
      "packages/agents/src/profiles.ts",
      "packages/agents/src/real-agent-runner.ts",
      "packages/agents/src/copilot.ts",
      "packages/core/src/readiness/agent-certification.ts",
      "apps/cli/src/commands/release.ts"
    ],
    testRefs: [
      "tests/contract/agent-certification.test.ts",
      "tests/integration/real-agent-acceptance.test.ts",
      "tests/contract/copilot-standalone-cli.test.ts",
      "tests/contract/copilot-agent-profile.test.ts"
    ]
  },
  mcp: {
    implementationRefs: [
      "packages/mcp/src/server.ts",
      "packages/mcp/src/tools.ts",
      "packages/mcp/src/resources.ts",
      "packages/mcp/src/errors.ts"
    ],
    testRefs: [
      "tests/contract/mcp-tools.test.ts",
      "tests/contract/mcp-full-srs-tools.test.ts",
      "tests/integration/mcp-stdio-agent.test.ts",
      "tests/integration/mcp-surface-parity.test.ts"
    ]
  },
  memory: {
    implementationRefs: [
      "packages/core/src/memory/service.ts",
      "packages/core/src/memory/export.ts",
      "packages/memory/src/markdown-adapter.ts",
      "packages/memory/src/memsearch-adapter.ts",
      "packages/memory/src/engram-adapter.ts",
      "apps/cli/src/commands/memory.ts"
    ],
    testRefs: [
      "tests/contract/memory.test.ts",
      "tests/integration/memory-backends.test.ts",
      "tests/integration/memory-backend-acceptance.test.ts",
      "tests/recovery/memory-stale-links.test.ts",
      "tests/privacy/code-search-ignore.test.ts"
    ]
  },
  code: {
    implementationRefs: [
      "packages/core/src/code/evidence-service.ts",
      "packages/code-tools/src/exact-search.ts",
      "packages/code-tools/src/structural-search.ts",
      "packages/code-tools/src/semantic-search.ts",
      "packages/code-tools/src/tool-wrappers.ts",
      "apps/cli/src/commands/code.ts"
    ],
    testRefs: [
      "tests/contract/code-search.test.ts",
      "tests/integration/code-search-exact.test.ts",
      "tests/integration/code-tool-adapter-certification.test.ts",
      "tests/recovery/code-evidence-stale.test.ts"
    ]
  },
  context: {
    implementationRefs: [
      "packages/core/src/context/builder.ts",
      "packages/core/src/context/ranking.ts",
      "packages/core/src/context/export.ts",
      "apps/cli/src/commands/context.ts",
      "apps/server/src/routes/context-packs.ts"
    ],
    testRefs: [
      "tests/contract/context-pack.test.ts",
      "tests/integration/context-build-offline.test.ts",
      "tests/integration/context-provenance.test.ts",
      "tests/integration/context-degraded-lanes.test.ts"
    ]
  },
  worktree: {
    implementationRefs: [
      "packages/core/src/worktrees/allocation.ts",
      "packages/core/src/worktrees/status.ts",
      "apps/cli/src/commands/worktree.ts",
      "apps/server/src/routes/worktrees.ts"
    ],
    testRefs: [
      "tests/contract/worktree.test.ts",
      "tests/integration/worktree-cleanup-block.test.ts",
      "tests/recovery/worktree-unsafe-states.test.ts",
      "tests/policy/worktree-merge-readiness.test.ts"
    ]
  },
  quality: {
    implementationRefs: [
      "packages/core/src/quality/runner.ts",
      "packages/core/src/quality/readiness.ts",
      "packages/core/src/runs/quality-links.ts",
      "apps/cli/src/commands/gate.ts",
      "apps/server/src/routes/quality.ts"
    ],
    testRefs: [
      "tests/contract/quality-gates.test.ts",
      "tests/integration/quality-gate-runner.test.ts",
      "tests/policy/quality-required-blocks.test.ts"
    ]
  },
  artifact: {
    implementationRefs: [
      "packages/core/src/artifacts/service.ts",
      "packages/core/src/artifacts/storage.ts",
      "apps/cli/src/commands/artifact.ts",
      "apps/server/src/routes/artifacts.ts"
    ],
    testRefs: [
      "tests/contract/artifacts.test.ts",
      "tests/privacy/quality-output-redaction.test.ts",
      "tests/integration/provenance-completeness.test.ts"
    ]
  },
  policy: {
    implementationRefs: [
      "packages/core/src/policy/enforcement.ts",
      "packages/core/src/policy/previews.ts",
      "packages/policy/src/evaluator.ts",
      "packages/policy/src/local-only.ts",
      "apps/cli/src/commands/policy.ts",
      "apps/server/src/routes/policy.ts"
    ],
    testRefs: [
      "tests/contract/policy-contract.test.ts",
      "tests/policy/policy-matrix.test.ts",
      "tests/policy/constitution-dangerous-actions.test.ts",
      "tests/policy/mcp-policy-gates.test.ts",
      "tests/privacy/local-only-denies-remote.test.ts"
    ]
  },
  doctor: {
    implementationRefs: [
      "packages/core/src/doctor/setup-doctor.ts",
      "packages/core/src/doctor/capability-probes.ts",
      "apps/cli/src/commands/doctor.ts",
      "apps/server/src/routes/doctor.ts",
      "apps/cockpit/src/routes/doctor.tsx",
      "docs/operator-guide.md"
    ],
    testRefs: [
      "tests/contract/doctor-capability-matrix.test.ts",
      "tests/contract/cli-setup-doctor.test.ts",
      "tests/integration/doctor-fixtures.test.ts",
      "tests/integration/project-doctor-readiness.test.ts",
      "tests/privacy/setup-doctor-no-network.test.ts"
    ]
  },
  backup: {
    implementationRefs: [
      "packages/core/src/recovery/backup.ts",
      "packages/core/src/recovery/restore.ts",
      "packages/core/src/recovery/export.ts",
      "packages/core/src/recovery/rebuild.ts",
      "apps/cli/src/commands/recovery.ts",
      "apps/server/src/routes/recovery.ts"
    ],
    testRefs: [
      "tests/contract/recovery-contract.test.ts",
      "tests/recovery/backup-restore.test.ts",
      "tests/recovery/rebuild-derived-data.test.ts",
      "tests/policy/reset-uninstall-preview.test.ts"
    ]
  },
  release: {
    implementationRefs: [
      "packages/core/src/readiness/release-validator.ts",
      "packages/core/src/readiness/evidence-writer.ts",
      "apps/cli/src/commands/release.ts",
      "apps/server/src/routes/release.ts",
      "apps/cockpit/src/routes/release.tsx",
      "docs/release-checklist.md"
    ],
    testRefs: [
      "tests/contract/release-readiness-contract.test.ts",
      "tests/privacy/release-evidence-redaction.test.ts",
      "tests/e2e/quickstart/release-readiness.sh"
    ]
  },
  cockpit: {
    implementationRefs: [
      "apps/cockpit/src/App.tsx",
      "apps/cockpit/src/routes/project-board.tsx",
      "apps/cockpit/src/routes/run-detail.tsx",
      "apps/cockpit/src/routes/review-queue.tsx",
      "apps/cockpit/src/routes/policy-approvals.tsx",
      "apps/cockpit/src/routes/recovery.tsx",
      "apps/cockpit/src/components/live-activity.tsx"
    ],
    testRefs: [
      "tests/e2e/cockpit-owned-workflow.spec.ts",
      "tests/e2e/cockpit-review-readiness.spec.ts",
      "tests/e2e/cockpit-accessibility-full.spec.ts",
      "tests/e2e/cockpit-project-board.spec.ts"
    ]
  },
  graph: {
    implementationRefs: [
      "packages/core/src/graph/service.ts",
      "packages/core/src/graph/queries.ts",
      "packages/core/src/graph/link-writers.ts",
      "packages/core/src/readiness/invalidation-service.ts",
      "apps/cli/src/commands/graph.ts",
      "apps/server/src/routes/graph.ts",
      "apps/cockpit/src/routes/traceability.tsx"
    ],
    testRefs: [
      "tests/contract/graph-links.test.ts",
      "tests/contract/invalidation-records.test.ts",
      "tests/integration/graph-incremental-correctness.test.ts",
      "tests/recovery/repo-cache-invalidation.test.ts",
      "tests/integration/graph-traceability-status.test.ts"
    ]
  },
  setup: {
    implementationRefs: [
      "packages/core/src/setup/apply.ts",
      "packages/core/src/setup/preview.ts",
      "packages/core/src/setup/paths.ts",
      "packages/core/src/readiness/install-targets.ts",
      "apps/cli/src/commands/setup.ts",
      "apps/cli/src/runtime.ts"
    ],
    testRefs: [
      "tests/contract/package-start-contract.test.ts",
      "tests/contract/cli-setup-doctor.test.ts",
      "tests/integration/setup-doctor-flow.test.ts",
      "tests/e2e/quickstart/product-install-readiness.sh"
    ]
  },
  security: {
    implementationRefs: [
      "packages/policy/src/redaction.ts",
      "packages/core/src/privacy/ignored-paths.ts",
      "packages/policy/src/local-only.ts",
      "apps/server/src/bind-policy.ts"
    ],
    testRefs: [
      "tests/privacy/secret-redaction.test.ts",
      "tests/privacy/no-network-core.test.ts",
      "tests/privacy/local-only-product-flow.test.ts",
      "tests/privacy/local-only-denies-remote.test.ts",
      "tests/policy/package-server-bind.test.ts"
    ]
  },
  performance: {
    implementationRefs: [
      "packages/core/src/context/ranking.ts",
      "packages/core/src/readiness/install-targets.ts",
      "packages/core/src/doctor/capability-probes.ts"
    ],
    testRefs: [
      "tests/integration/status-performance.test.ts",
      "tests/contract/package-start-contract.test.ts"
    ]
  },
  adapter: {
    implementationRefs: [
      "packages/core/src/adapters/registry.ts",
      "packages/core/src/adapters/health-modules.ts",
      "packages/core/src/readiness/adapter-certification.ts",
      "packages/code-tools/src/tool-wrappers.ts",
      "packages/memory/src/probe.ts",
      "apps/cli/src/commands/adapter.ts",
      "apps/server/src/routes/adapters.ts"
    ],
    testRefs: [
      "tests/contract/adapter-base.test.ts",
      "tests/contract/adapter-certification.test.ts",
      "tests/integration/adapter-degradation.test.ts",
      "tests/integration/code-tool-adapter-certification.test.ts",
      "tests/integration/memory-adapter-certification.test.ts"
    ]
  }
};

export interface ResolvedEvidenceGroups {
  groups: EvidenceGroupId[];
  implementationRefs: string[];
  testRefs: string[];
  evidenceRefs: string[];
}

export function buildRepositoryComplianceEvidence(
  audit: ComplianceAuditResult,
  rootDir: string
): ComplianceEvidenceIndex {
  const evidence: ComplianceEvidenceIndex = {
    implementationRefs: {},
    testRefs: {},
    evidenceRefs: {},
    nextActions: {}
  };

  for (const requirement of audit.requirements) {
    if (requirement.status === "superseded") continue;
    const resolved = resolveRequirementEvidence(requirement, rootDir);
    const { groups: groupIds, implementationRefs, testRefs, evidenceRefs } = resolved;
    if (implementationRefs.length === 0 || testRefs.length === 0) continue;
    evidence.implementationRefs![requirement.requirementId] = implementationRefs;
    evidence.testRefs![requirement.requirementId] = testRefs;
    evidence.evidenceRefs![requirement.requirementId] = evidenceRefs;
    evidence.nextActions![requirement.requirementId] =
      `Keep ${groupIds.join(", ")} implementation and tests current.`;
  }

  return evidence;
}

export function resolveEvidenceGroups(
  rootDir: string,
  groupIds: EvidenceGroupId[]
): ResolvedEvidenceGroups {
  const groups = [...new Set(groupIds)];
  return {
    groups,
    implementationRefs: uniqueExistingRefs(
      rootDir,
      groups.flatMap((id) => evidenceGroups[id].implementationRefs)
    ),
    testRefs: uniqueExistingRefs(
      rootDir,
      groups.flatMap((id) => evidenceGroups[id].testRefs)
    ),
    evidenceRefs: uniqueExistingRefs(
      rootDir,
      groups.flatMap((id) => evidenceGroups[id].evidenceRefs ?? [])
    )
  };
}

export function resolveRequirementEvidence(
  requirement: ComplianceRequirement,
  rootDir: string
): ResolvedEvidenceGroups {
  return resolveEvidenceGroups(rootDir, classifyRequirementEvidence(requirement));
}

function classifyRequirementEvidence(requirement: ComplianceRequirement): EvidenceGroupId[] {
  const id = requirement.requirementId;
  const text = requirement.text.toLowerCase();
  const groups = new Set<EvidenceGroupId>();

  if (id.startsWith("FR-PROJ")) groups.add("project");
  else if (id.startsWith("FR-PLANE")) groups.add("plane");
  else if (id.startsWith("FR-TASK")) groups.add("task");
  else if (id.startsWith("FR-RUN")) groups.add("run");
  else if (id.startsWith("FR-AGENT")) groups.add("agent");
  else if (id.startsWith("FR-MCP")) groups.add("mcp");
  else if (id.startsWith("FR-MEM")) groups.add("memory");
  else if (id.startsWith("FR-CODE")) groups.add("code");
  else if (id.startsWith("FR-CTX")) groups.add("context");
  else if (id.startsWith("FR-WT")) groups.add("worktree");
  else if (id.startsWith("FR-QG")) groups.add("quality");
  else if (id.startsWith("FR-ART")) groups.add("artifact");
  else if (id.startsWith("FR-POL")) groups.add("policy");
  else if (id.startsWith("FR-DOC")) groups.add("doctor");
  else if (id.startsWith("FR-BACKUP")) groups.add("backup");
  else if (id.startsWith("NFR-LOCAL")) groups.add("setup");
  else if (id.startsWith("NFR-REL")) groups.add("backup");
  else if (id.startsWith("NFR-PERF")) groups.add("performance");
  else if (id.startsWith("NFR-SEC")) groups.add("security");
  else if (id.startsWith("NFR-USE")) groups.add("product");
  else if (id.startsWith("NFR-EXT")) groups.add("adapter");

  if (
    /compliance|product\/srs|source order|supersed|mock-only|preview-only|documentation-only/.test(
      text
    )
  ) {
    groups.add("compliance");
  }

  if (
    /typescript|monorepo|react|shared schema|contract|sqlite schema|mcp tools|node-first/.test(text)
  ) {
    groups.add("tech");
  }
  if (/copilot|agent|claude|gemini|codex|opencode|goose|openhands|plandex/.test(text)) {
    groups.add("agent");
  }
  if (/plane|external pm|jira|linear|online pm|source of truth|hidden source of truth/.test(text)) {
    groups.add("plane");
  }
  if (/project|workspace|registry/.test(text)) groups.add("project");
  if (/task|queue/.test(text)) groups.add("task");
  if (/run|heartbeat|stdout|stderr|process|orchestrat|execution|supervis/.test(text)) {
    groups.add("run");
  }
  if (/mcp|model context protocol/.test(text)) groups.add("mcp");
  if (/memory|markdown|engram|memsearch|knowledge/.test(text)) groups.add("memory");
  if (
    /code|ripgrep|git grep|fd|ast-grep|aider|repomix|semantic|symbol|repo-map|repo pack|repo-pack|lsp|refreshed/.test(
      text
    )
  ) {
    groups.add("code");
  }
  if (/context|ranked|included|evidence was used/.test(text)) groups.add("context");
  if (/worktree|branch|merge|cleanup|diff|delivery|delete|overwrite user changes/.test(text)) {
    groups.add("worktree");
  }
  if (/quality|gate|merge readiness|review readiness/.test(text)) groups.add("quality");
  if (/artifact|log|transcript|redact/.test(text)) groups.add("artifact");
  if (
    /policy|approval|dangerous|preview|dry-run|loopback|ignore|privacy|remote|network|secret|public bind|disabled by default|silently delete|silently overwrite/.test(
      text
    )
  ) {
    groups.add("policy");
  }
  if (/doctor|diagnose|capabilit|next action|health status/.test(text)) groups.add("doctor");
  if (
    /setup|install|package|prerequisite|source checkout|usable `?fulcrum`?|server starts|loopback/.test(
      text
    )
  ) {
    groups.add("setup");
  }
  if (
    /backup|restore|export|rebuild|crash|canonical|sqlite|event log|transactional|projection/.test(
      text
    )
  ) {
    groups.add("backup");
  }
  if (/release|validation|readiness|proof|evidence pack|operator guide|checklist/.test(text)) {
    groups.add("release");
  }
  if (
    /cockpit|dashboard|board|review queue|policy approvals|recovery view|live activity|ui|tui/.test(
      text
    )
  ) {
    groups.add("cockpit");
  }
  if (
    /\bgraph\b|\bgraphs\b|link|provenance|explainable|source refs|stale|invalidation|ranking/.test(
      text
    )
  ) {
    groups.add("graph");
  }
  if (
    /adapter|replaceable|optional|integration|configured through adapter|telemetry|observability|langfuse|helicone|opentelemetry|open-source tools|disabled by default/.test(
      text
    )
  ) {
    groups.add("adapter");
  }
  if (/performance|under 1 second|under 3 seconds/.test(text)) groups.add("performance");
  if (
    groups.size > 0 &&
    /fulcrum|surface|cli|json|machine-readable|operator|local-first|product center|operations center|same underlying state/.test(
      text
    )
  ) {
    groups.add("product");
  }
  return [...groups];
}

function uniqueExistingRefs(rootDir: string, refs: string[]): string[] {
  return [...new Set(refs)].filter((ref) => existsSync(path.join(rootDir, ref)));
}
