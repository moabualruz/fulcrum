/**
 * Casbin ABAC permissions panel for Settings screen.
 * Gated by FULCRUM_FEATURES=casbin-policies.
 * CRUD rule editor with syntax preview.
 */

import { isFeatureEnabled } from "./feature-flags.ts";
import type { NavigatorEntry } from "./experiments.ts";

export interface CasbinRule {
  id: string;
  subject: string;
  object: string;
  action: string;
  effect: string;
}

export type CasbinRuleInput = Omit<CasbinRule, "id">;

export interface SaveResult {
  type: "casbin-policies";
  rules: CasbinRule[];
}

let nextId = 1;

export class CasbinPoliciesPanel {
  private rules: Map<string, CasbinRule> = new Map();

  isVisible(): boolean {
    return isFeatureEnabled("casbin-policies");
  }

  addRule(input: CasbinRuleInput): CasbinRule {
    const rule: CasbinRule = { id: `rule-${nextId++}`, ...input };
    this.rules.set(rule.id, rule);
    return rule;
  }

  getRule(id: string): CasbinRule | undefined {
    return this.rules.get(id);
  }

  listRules(): CasbinRule[] {
    return [...this.rules.values()];
  }

  updateRule(id: string, patch: Partial<CasbinRuleInput>): CasbinRule | undefined {
    const existing = this.rules.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.rules.set(id, updated);
    return updated;
  }

  deleteRule(id: string): boolean {
    return this.rules.delete(id);
  }

  /** Casbin policy syntax preview: p, sub, obj, act, eft */
  syntaxPreview(id: string): string | null {
    const rule = this.rules.get(id);
    if (!rule) return null;
    return `p, ${rule.subject}, ${rule.object}, ${rule.action}, ${rule.effect}`;
  }

  /** Persist rules — returns structured save result. */
  save(): SaveResult {
    return {
      type: "casbin-policies",
      rules: this.listRules(),
    };
  }

  navigatorEntry(): NavigatorEntry | null {
    if (!this.isVisible()) return null;
    return { label: "Permissions", path: "settings/permissions" };
  }
}
