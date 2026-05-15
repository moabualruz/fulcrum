/**
 * WorkItemFieldDependencyService.
 *
 * Server-side field dependency validation and CRUD.
 * Called by WorkItemService.create/update to enforce required-field rules,
 * preventing client-side bypass (T-05-26 mitigation).
 *
 * Security: orgId scope enforced on every query.
 */

import type { EntityManager } from "@mikro-orm/postgresql";

import { FieldDependencyRule } from "@platform-core/infrastructure/application-database/entities/tasks/FieldDependencyRule.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateRuleInput {
  projectId: string;
  sourceFieldId: string;
  sourceValue: string;
  targetFieldId: string;
  /** "show" | "hide" | "require" */
  action: string;
}

export type FieldValues = Record<string, unknown>;

// ── Service ────────────────────────────────────────────────────────────────────

export class WorkItemFieldDependencyService {
  constructor(private readonly em: EntityManager) {}

  // ── Query ─────────────────────────────────────────────────────────────────────

  /**
   * Returns all field dependency rules for a project, scoped to orgId.
   */
  async listRules(orgId: string, projectId: string): Promise<FieldDependencyRule[]> {
    return this.em.find(FieldDependencyRule, {
      projectId,
      org: { id: orgId },
    });
  }

  // ── Validation ────────────────────────────────────────────────────────────────

  /**
   * Validates proposed field values against all rules for the project.
   * Throws AppValidationError if any required fields are missing.
   *
   * Security: orgId scope prevents cross-org rule leakage (T-05-26).
   */
  async validate(
    orgId: string,
    projectId: string,
    fieldValues: FieldValues,
  ): Promise<void> {
    const rules = await this.listRules(orgId, projectId);

    const missingFields: string[] = [];

    for (const rule of rules) {
      if (rule.action !== "require") continue;

      // Rule triggers when fieldValues[sourceFieldId] === sourceValue
      const actual = String(fieldValues[rule.sourceFieldId] ?? "");
      if (actual !== rule.sourceValue) continue;

      // Required: targetFieldId must be non-empty
      const targetValue = fieldValues[rule.targetFieldId];
      const isEmpty =
        targetValue === undefined ||
        targetValue === null ||
        targetValue === "" ||
        (Array.isArray(targetValue) && targetValue.length === 0);

      if (isEmpty) {
        missingFields.push(rule.targetFieldId);
      }
    }

    if (missingFields.length > 0) {
      throw new AppValidationError(`Required fields missing: ${missingFields.join(", ")}`);
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  /**
   * Creates a new field dependency rule.
   */
  async createRule(orgId: string, input: CreateRuleInput): Promise<FieldDependencyRule> {
    const org = this.em.getReference(Org, orgId);
    const rule = new FieldDependencyRule();
    rule.org = org as Org;
    rule.projectId = input.projectId;
    rule.sourceFieldId = input.sourceFieldId;
    rule.sourceValue = input.sourceValue;
    rule.targetFieldId = input.targetFieldId;
    rule.action = input.action;
    this.em.persist(rule);
    await this.em.flush();
    return rule;
  }

  /**
   * Deletes a field dependency rule by ID, scoped to orgId.
   * Throws if not found.
   */
  async deleteRule(orgId: string, ruleId: string): Promise<void> {
    const rule = await this.em.findOne(FieldDependencyRule, {
      id: ruleId,
      org: { id: orgId },
    });
    if (!rule) {
      throw new AppNotFoundError(`Rule ${ruleId} not found`);
    }
    this.em.remove(rule);
    await this.em.flush();
  }
}
