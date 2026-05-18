import { randomUUID } from "node:crypto";

import { DataSource, IsNull, type FindOptionsWhere } from "typeorm";

import {
  type FulcrumRoutingDraft,
  FulcrumRoutingDraftEntity,
  type FulcrumRoutingDraftStatus,
  type FulcrumRoutingRule,
  FulcrumRoutingRuleEntity,
  type FulcrumRoutingRuleSource,
} from "@execution-orchestration/infrastructure/database/routing.entities.ts";
import {
  type FulcrumProject,
  type FulcrumTask,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

type JsonRecord = Record<string, unknown>;
type TaskFacts = {
  task: { title: string; kind: string; priority: string; tags: string[]; projectId?: string | null };
  context?: { connector?: JsonRecord };
};

export interface RoutingRequestContextPublicRow {
  orgId: string;
  userId: string;
  projectId: string | null;
  connectorContext: JsonRecord | null;
}

export interface RoutingRulePublicRow {
  id: string;
  orgId: string;
  projectId: string | null;
  name: string;
  conditionsJson: JsonRecord;
  actionAgent: string;
  actionSkillSet: string[];
  priority: number;
  enabled: boolean;
  source: FulcrumRoutingRuleSource;
  createdAt: string | null;
  updatedAt: string | null;
}

interface RoutingDecisionBasePublicRow {
  requestContext: RoutingRequestContextPublicRow;
  matchedRuleId: string | null;
  draftId: string | null;
  factsUsed: JsonRecord;
  confidence: number | null;
  backend: string | null;
  model: string | null;
  whyUnmatched: string | null;
  evidence: string[];
}

export interface RoutingDecisionPublicRow extends RoutingDecisionBasePublicRow {
  status: "matched" | "no_match" | "recommended" | "draft_created" | "conflict" | "abstained";
  agent: string;
}

export interface RoutingDraftPublicRow extends RoutingDecisionBasePublicRow {
  draftId: string;
  orgId: string;
  projectId: string | null;
  status: FulcrumRoutingDraftStatus;
  proposedConditionsJson: JsonRecord;
  proposedActionsJson: JsonRecord;
  createdAt: string | null;
  updatedAt: string | null;
}

interface RoutingScope {
  orgId: string;
}

export class RoutingPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async listRules(input: RoutingScope & { projectId?: string | null }): Promise<RoutingRulePublicRow[]> {
    const where: FindOptionsWhere<FulcrumRoutingRule> = input.projectId === undefined
      ? { orgId: input.orgId }
      : { orgId: input.orgId, projectId: input.projectId === null ? IsNull() : input.projectId };
    const rules = await this.ruleRepository().find({
      where,
      order: { priority: "ASC", createdAt: "ASC", id: "ASC" },
    });
    return rules.map(serializeRule);
  }

  async getRule(input: RoutingScope & { id: string }): Promise<RoutingRulePublicRow | null> {
    const rule = await this.ruleRepository().findOneBy({ orgId: input.orgId, id: input.id });
    return rule ? serializeRule(rule) : null;
  }

  async createRule(input: RoutingScope & {
    projectId?: string | null;
    name: string;
    conditionsJson: JsonRecord;
    actionAgent: string;
    actionSkillSet?: string[];
    priority?: number;
    enabled?: boolean;
    source?: FulcrumRoutingRuleSource;
  }): Promise<RoutingRulePublicRow> {
    const rule = await this.ruleRepository().save({
      id: randomUUID(),
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      name: input.name,
      conditionsJson: objectValue(input.conditionsJson),
      actionAgent: input.actionAgent,
      actionSkillSet: stringArray(input.actionSkillSet),
      priority: input.priority ?? 100,
      enabled: input.enabled ?? true,
      source: input.source ?? "manual",
    });
    return serializeRule(rule);
  }

  async updateRule(input: RoutingScope & {
    id: string;
    projectId?: string | null;
    name?: string;
    conditionsJson?: JsonRecord;
    actionAgent?: string;
    actionSkillSet?: string[];
    priority?: number;
    enabled?: boolean;
    source?: FulcrumRoutingRuleSource;
  }): Promise<RoutingRulePublicRow | null> {
    const rule = await this.ruleRepository().findOneBy({ orgId: input.orgId, id: input.id });
    if (!rule) return null;

    if (input.projectId !== undefined) rule.projectId = input.projectId;
    if (input.name !== undefined) rule.name = input.name;
    if (input.conditionsJson !== undefined) rule.conditionsJson = objectValue(input.conditionsJson);
    if (input.actionAgent !== undefined) rule.actionAgent = input.actionAgent;
    if (input.actionSkillSet !== undefined) rule.actionSkillSet = stringArray(input.actionSkillSet);
    if (input.priority !== undefined) rule.priority = input.priority;
    if (input.enabled !== undefined) rule.enabled = input.enabled;
    if (input.source !== undefined) rule.source = input.source;

    return serializeRule(await this.ruleRepository().save(rule));
  }

  async deleteRule(input: RoutingScope & { id: string }): Promise<{ ok: true }> {
    await this.ruleRepository().delete({ orgId: input.orgId, id: input.id });
    return { ok: true };
  }

  async dryRun(input: RoutingScope & { userId?: string; taskJson: JsonRecord }): Promise<RoutingDecisionPublicRow> {
    return await this.decide(input.orgId, userId(input), taskFactsFromJson(input.taskJson), false);
  }

  async testTask(input: RoutingScope & { userId?: string; taskId: string }): Promise<RoutingDecisionPublicRow | null> {
    const task = await this.taskRepository().findOneBy({ id: input.taskId });
    if (!task) return null;
    const project = await this.projectRepository().findOneBy({ id: task.projectId, workspaceId: input.orgId });
    if (!project) return null;
    return await this.decide(input.orgId, userId(input), taskFactsFromTask(task, project), true);
  }

  async listDrafts(input: RoutingScope & { status?: FulcrumRoutingDraftStatus | string }): Promise<RoutingDraftPublicRow[]> {
    const where = input.status ? { orgId: input.orgId, status: input.status as FulcrumRoutingDraftStatus } : { orgId: input.orgId };
    const drafts = await this.draftRepository().find({
      where,
      order: { createdAt: "ASC", id: "ASC" },
    });
    return drafts.map(serializeDraft);
  }

  async updateDraft(input: RoutingScope & {
    id: string;
    conditionsJson?: JsonRecord;
    actionAgent?: string;
    actionSkillSet?: string[];
  }): Promise<boolean> {
    const draft = await this.draftRepository().findOneBy({ orgId: input.orgId, id: input.id });
    if (!draft) return false;

    if (input.conditionsJson !== undefined) draft.proposedConditionsJson = objectValue(input.conditionsJson);
    if (input.actionAgent !== undefined || input.actionSkillSet !== undefined) {
      draft.proposedActionsJson = {
        ...objectValue(draft.proposedActionsJson),
        ...(input.actionAgent !== undefined ? { actionAgent: input.actionAgent } : {}),
        ...(input.actionSkillSet !== undefined ? { actionSkillSet: stringArray(input.actionSkillSet) } : {}),
      };
    }

    await this.draftRepository().save(draft);
    return true;
  }

  async approveDraft(input: RoutingScope & { id: string }): Promise<boolean> {
    const draft = await this.draftRepository().findOneBy({ orgId: input.orgId, id: input.id });
    if (!draft) return false;

    const actions = objectValue(draft.proposedActionsJson);
    const actionAgent = typeof actions["actionAgent"] === "string" && actions["actionAgent"].trim()
      ? actions["actionAgent"]
      : "codex";
    const actionSkillSet = Array.isArray(actions["actionSkillSet"])
      ? actions["actionSkillSet"].filter((value): value is string => typeof value === "string")
      : [];
    const rule = await this.ruleRepository().save({
      id: randomUUID(),
      orgId: draft.orgId,
      projectId: draft.projectId,
      name: approvedRuleName(draft),
      conditionsJson: objectValue(draft.proposedConditionsJson),
      actionAgent,
      actionSkillSet,
      priority: 100,
      enabled: true,
      source: "learned" as FulcrumRoutingRuleSource,
    });

    draft.status = "approved";
    draft.enabled = true;
    draft.matchingActiveRuleIdsJson = [rule.id];
    await this.draftRepository().save(draft);
    return true;
  }

  async deleteDraft(input: RoutingScope & { id: string }): Promise<boolean> {
    const result = await this.draftRepository().delete({ orgId: input.orgId, id: input.id });
    return Number(result.affected ?? 0) > 0;
  }

  async updateLlmGate(input: {
    enabled?: boolean;
    inputMode?: "task_facts" | "task_plus_history" | "full_context";
  }): Promise<{ ok: true; enabled?: boolean; inputMode?: string }> {
    return {
      ok: true,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.inputMode !== undefined ? { inputMode: input.inputMode } : {}),
    };
  }

  private async decide(
    orgId: string,
    userId: string,
    facts: TaskFacts,
    createLearningDraft: boolean,
  ): Promise<RoutingDecisionPublicRow> {
    const requestContext = routingRequestContext(orgId, userId, facts);
    const rules = await this.dispatchRules(orgId, facts.task.projectId);
    const matched = rules.find((rule) => matchesRule(rule, facts));
    if (!matched) {
      const draftId = createLearningDraft ? await this.createNoMatchDraft(orgId, facts) : null;
      return {
        requestContext,
        status: draftId ? "draft_created" : "no_match",
        matchedRuleId: null,
        draftId,
        agent: "",
        factsUsed: facts as unknown as JsonRecord,
        confidence: 0,
        backend: null,
        model: null,
        whyUnmatched: `No routing rule matched task kind=${facts.task.kind}.`,
        evidence: [
          `no-match: kind=${facts.task.kind} priority=${facts.task.priority}`,
          "llm-fallback: disabled unless router-llm feature is enabled",
          ...(draftId ? [`draft-created: ${draftId} disabled for review`] : []),
          ...(facts.context?.connector ? ["connector-context: included in routing facts"] : []),
        ],
      };
    }

    return {
      requestContext,
      status: "matched",
      matchedRuleId: matched.id,
      draftId: null,
      agent: matched.actionAgent,
      factsUsed: facts as unknown as JsonRecord,
      confidence: 1,
      backend: null,
      model: null,
      whyUnmatched: null,
      evidence: [
        `matched rule ${matched.id} with agent=${matched.actionAgent}`,
        ...(facts.context?.connector ? ["connector-context: included in routing facts"] : []),
      ],
    };
  }

  private async createNoMatchDraft(orgId: string, facts: TaskFacts): Promise<string> {
    const draft = await this.draftRepository().save({
      id: randomUUID(),
      orgId,
      projectId: facts.task.projectId ?? null,
      status: "review_needed",
      enabled: false,
      taskFactsJson: facts as unknown as JsonRecord,
      noMatchReason: `No routing rule matched task kind=${facts.task.kind}.`,
      proposedConditionsJson: {
        all: [{ fact: "task", path: "$.kind", operator: "equal", value: facts.task.kind }],
      },
      proposedActionsJson: { actionAgent: "", actionSkillSet: [] },
      source: "no_match",
      confidence: 0,
      backend: null,
      model: null,
      matchingActiveRuleIdsJson: [],
    });
    return draft.id;
  }

  private async dispatchRules(orgId: string, projectId?: string | null): Promise<FulcrumRoutingRule[]> {
    const where = projectId
      ? [
        { orgId, enabled: true, projectId: IsNull() },
        { orgId, enabled: true, projectId },
      ]
      : { orgId, enabled: true };
    return await this.ruleRepository().find({ where, order: { priority: "ASC", createdAt: "ASC", id: "ASC" } });
  }

  private ruleRepository() {
    return this.dataSource.getRepository(FulcrumRoutingRuleEntity);
  }

  private draftRepository() {
    return this.dataSource.getRepository(FulcrumRoutingDraftEntity);
  }

  private taskRepository() {
    return this.dataSource.getRepository(FulcrumTaskEntity);
  }

  private projectRepository() {
    return this.dataSource.getRepository(FulcrumProjectEntity);
  }
}

function serializeRule(rule: FulcrumRoutingRule): RoutingRulePublicRow {
  return {
    id: rule.id,
    orgId: rule.orgId,
    projectId: rule.projectId,
    name: rule.name,
    conditionsJson: objectValue(rule.conditionsJson),
    actionAgent: rule.actionAgent,
    actionSkillSet: stringArray(rule.actionSkillSet),
    priority: rule.priority,
    enabled: rule.enabled,
    source: rule.source,
    createdAt: dateString(rule.createdAt),
    updatedAt: dateString(rule.updatedAt),
  };
}

function serializeDraft(draft: FulcrumRoutingDraft): RoutingDraftPublicRow {
  return {
    requestContext: {
      orgId: draft.orgId,
      userId: "",
      projectId: draft.projectId,
      connectorContext: connectorContextFromFacts(objectValue(draft.taskFactsJson)),
    },
    draftId: draft.id,
    orgId: draft.orgId,
    projectId: draft.projectId,
    status: draft.status,
    matchedRuleId: null,
    factsUsed: objectValue(draft.taskFactsJson),
    confidence: draft.confidence,
    backend: draft.backend,
    model: draft.model,
    whyUnmatched: draft.noMatchReason,
    evidence: [`draft:${draft.status}`],
    proposedConditionsJson: objectValue(draft.proposedConditionsJson),
    proposedActionsJson: objectValue(draft.proposedActionsJson),
    createdAt: dateString(draft.createdAt),
    updatedAt: dateString(draft.updatedAt),
  };
}

function taskFactsFromTask(task: FulcrumTask, project: FulcrumProject): TaskFacts {
  return {
    task: {
      title: task.title,
      kind: task.status || "task",
      priority: task.priority == null ? "normal" : String(task.priority),
      tags: [],
      projectId: project.id,
    },
  };
}

function taskFactsFromJson(taskJson: JsonRecord): TaskFacts {
  const connectorContext = objectValue(taskJson["connectorContext"]);
  return {
    task: {
      title: stringValue(taskJson["title"], "Untitled task"),
      kind: stringValue(taskJson["kind"], "task"),
      priority: stringValue(taskJson["priority"], "normal"),
      tags: stringArray(taskJson["tags"]),
      projectId: typeof taskJson["projectId"] === "string" ? taskJson["projectId"] : null,
    },
    ...(Object.keys(connectorContext).length > 0 ? { context: { connector: connectorContext } } : {}),
  };
}

function matchesRule(rule: FulcrumRoutingRule, facts: TaskFacts): boolean {
  const all = objectValue(rule.conditionsJson)["all"];
  if (!Array.isArray(all)) return false;
  return all.every((condition) => matchesCondition(condition, facts));
}

function matchesCondition(condition: unknown, facts: TaskFacts): boolean {
  const record = objectValue(condition);
  const actual = conditionActualValue(record, facts);
  const expected = record["value"];
  switch (record["operator"]) {
    case "equal":
      return actual === expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "contains":
      return Array.isArray(actual) && actual.includes(expected);
    default:
      return actual === expected;
  }
}

function conditionActualValue(condition: JsonRecord, facts: TaskFacts): unknown {
  const fact = condition["fact"];
  if (fact === "task.kind") return facts.task.kind;
  if (fact === "task.priority") return facts.task.priority;
  if (fact === "task.tags") return facts.task.tags;
  if (fact === "task.title") return facts.task.title;
  if (fact !== "task") return undefined;

  switch (condition["path"]) {
    case "$.kind":
      return facts.task.kind;
    case "$.priority":
      return facts.task.priority;
    case "$.tags":
      return facts.task.tags;
    case "$.title":
      return facts.task.title;
    default:
      return undefined;
  }
}

function approvedRuleName(draft: FulcrumRoutingDraft): string {
  const task = objectValue(draft.taskFactsJson)["task"];
  const kind = objectValue(task)["kind"];
  return `Approved ${typeof kind === "string" && kind.trim() ? kind : "task"} routing`;
}

function objectValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function dateString(value: Date | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function userId(input: { userId?: string }): string {
  return typeof input.userId === "string" ? input.userId : "";
}

function routingRequestContext(
  orgId: string,
  userIdValue: string,
  facts: TaskFacts,
): RoutingRequestContextPublicRow {
  return {
    orgId,
    userId: userIdValue,
    projectId: facts.task.projectId ?? null,
    connectorContext: facts.context?.connector ?? null,
  };
}

function connectorContextFromFacts(facts: JsonRecord): JsonRecord | null {
  const connector = objectValue(objectValue(facts["context"])["connector"]);
  return Object.keys(connector).length > 0 ? connector : null;
}
