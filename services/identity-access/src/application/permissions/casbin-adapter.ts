/**
 * FulcrumCasbinAdapter — custom node-casbin Adapter implementation.
 *
 * Implements the 5-method casbin Adapter interface against
 * EntityRepository<CasbinRule>. No raw SQL — all operations go through
 * MikroORM repository calls. No third-party casbin-typeorm-adapter or
 * casbin-knex-adapter dependency.
 *
 * CasbinRule columns: id (PK), ptype, v0..v5
 *   - ptype: "p" = permission policy, "g" = role grouping
 *   - v0..v5: policy fields (org, sub, obj, act, ... for "p"; user, role, org for "g")
 *
 * Constructor accepts CasbinRuleRepository and is injectable through needle-di.
 */

import { Injectable } from "@nestjs/common";
import { Helper } from "casbin";
import type { Adapter, Model } from "casbin";
import type { EntityManager } from "typeorm";
import type { CasbinRuleRepository } from "@platform-core/infrastructure/application-database/repositories/flags/CasbinRuleRepository.ts";
import { CasbinRule } from "@platform-core/infrastructure/application-database/entities/flags/CasbinRule.ts";

/**
 * Map from fieldIndex (0-based v0..v5) to the column name used in the
 * filter. index 0 → v0 (sub), 1 → v1 (obj), 2 → v2 (act), etc.
 */
const FIELD_COLUMNS: ReadonlyArray<keyof CasbinRule> = [
  "v0",
  "v1",
  "v2",
  "v3",
  "v4",
  "v5",
];

/** Build a CSV policy line from a CasbinRule entity row. */
function rowToLine(row: CasbinRule): string {
  const parts = [row.ptype];
  for (const col of FIELD_COLUMNS) {
    const val = row[col] as string | undefined;
    if (val !== undefined && val !== null && val !== "") {
      parts.push(val);
    } else {
      break;
    }
  }
  return parts.join(", ");
}

/** Build field assignment object from ptype + rule array. */
function ruleToFieldMap(
  ptype: string,
  rule: string[],
): { ptype: string } & Partial<Pick<CasbinRule, "v0" | "v1" | "v2" | "v3" | "v4" | "v5">> {
  const fields: { ptype: string } & Partial<Pick<CasbinRule, "v0" | "v1" | "v2" | "v3" | "v4" | "v5">> = { ptype };
  for (let i = 0; i < rule.length && i < FIELD_COLUMNS.length; i++) {
    (fields as Record<string, string>)[FIELD_COLUMNS[i]! as string] = rule[i]!;
  }
  return fields;
}

@Injectable()
export class FulcrumCasbinAdapter implements Adapter {
  constructor(private readonly _repo: CasbinRuleRepository) {}

  /**
   * loadPolicy — fetch all rows from casbin_rule and push each into the model
   * via casbin's Helper.loadPolicyLine(). The model uses the CSV format:
   * "p, org-a, alice, data1, read" or "g, alice, role:owner, org-a".
   */
  async loadPolicy(model: Model): Promise<void> {
    const rows = await this._repo.findAll();
    for (const row of rows) {
      const line = rowToLine(row);
      if (line.length > 0) {
        Helper.loadPolicyLine(line, model);
      }
    }
  }

  /**
   * savePolicy — flush model's current policy to DB.
   * Clears all existing rows first, then inserts one row per policy entry.
   * Runs in an em.transaction() block.
   */
  async savePolicy(model: Model): Promise<boolean> {
    // Get the underlying EM from the repo to run a transaction
    const em: EntityManager = (this._repo as unknown as { em: EntityManager }).em;

    await em.transaction(async (txEm: EntityManager) => {
      // Clear existing policies via entity class reference.
      await txEm.delete(CasbinRule, {} as never);

      // Re-insert from model
      const sections = ["p", "g"];
      for (const sec of sections) {
        const assertions = model.model.get(sec);
        if (!assertions) continue;
        for (const [ptype, assertion] of assertions.entries()) {
          for (const rule of assertion.policy) {
            const fields = ruleToFieldMap(ptype, rule);
            const entity = txEm.create(CasbinRule, fields);
            await txEm.save(entity);
          }
        }
      }

    });

    return true;
  }

  /**
   * addPolicy — insert a single policy rule row.
   * sec = "p" or "g"; ptype is the assertion key (e.g. "p", "g").
   */
  async addPolicy(_sec: string, ptype: string, rule: string[]): Promise<void> {
    const fields = ruleToFieldMap(ptype, rule);
    const em: EntityManager = (this._repo as unknown as { em: EntityManager }).em;
    const entity = em.create(CasbinRule, fields);
    await em.save(entity);
  }

  /**
   * removePolicy — delete the exact matching rule row.
   */
  async removePolicy(_sec: string, ptype: string, rule: string[]): Promise<void> {
    const filter = ruleToFieldMap(ptype, rule);
    await this._repo.delete(filter);
  }

  /**
   * removeFilteredPolicy — delete all rows matching ptype + field filter.
   *
   * fieldIndex: 0-based index into v0..v5 columns.
   * fieldValues: values to match at positions fieldIndex, fieldIndex+1, ...
   */
  async removeFilteredPolicy(
    _sec: string,
    ptype: string,
    fieldIndex: number,
    ...fieldValues: string[]
  ): Promise<void> {
    const filter: Partial<Record<string, string>> = { ptype };
    for (let i = 0; i < fieldValues.length; i++) {
      const col = FIELD_COLUMNS[fieldIndex + i];
      if (col && fieldValues[i] !== undefined && fieldValues[i] !== "") {
        filter[col as string] = fieldValues[i];
      }
    }
    await this._repo.delete(filter as never);
  }
}
