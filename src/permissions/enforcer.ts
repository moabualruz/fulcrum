/**
 * CasbinEnforcerService — singleton enforcer, lazy-initialized on first use.
 *
 * Wraps node-casbin's Enforcer with an org-scoped RBAC+resource+action model.
 * Gated: only instantiated when `casbin-policies` flag is ON.
 *
 * RBAC model: org, sub (user/role), obj (resource), act (action).
 * Policies: "p" rows define (org, sub, obj, act) allow tuples.
 * Grouping: "g" rows define (user, role, org) assignments for role inheritance.
 *
 * C6: No raw SQL.
 * C8: injectable() for needle-di; constructor accepts FulcrumCasbinAdapter.
 *
 * checkCasbinGate(svc, orgId, userId, resource, action):
 *   - If enforce() → true: allow (return).
 *   - If enforce() → false AND hasRuleFor(orgId, userId, resource) → true: DENY → throws FORBIDDEN.
 *   - If enforce() → false AND hasRuleFor() → false: fall through (return, let Better-Auth decide).
 */

import { injectable } from "@needle-di/core";
import { newEnforcer, newModel } from "casbin";
import type { Enforcer } from "casbin";
import { TRPCError } from "@trpc/server";

import type { FulcrumCasbinAdapter } from "./casbin-adapter.ts";

// ─────────────────────────────────────────────────────────────────────────────
// RBAC model — org-scoped sub/obj/act with domain role inheritance
// ─────────────────────────────────────────────────────────────────────────────

const RBAC_MODEL_TEXT = `
[request_definition]
r = org, sub, obj, act

[policy_definition]
p = org, sub, obj, act

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = r.org == p.org && g(r.sub, p.sub, r.org) && (p.obj == "*" || r.obj == p.obj) && (p.act == "*" || r.act == p.act)
`;

@injectable()
export class CasbinEnforcerService {
  private _enforcer: Enforcer | null = null;

  constructor(private readonly _adapter: FulcrumCasbinAdapter) {}

  /**
   * enforce — evaluate (org, sub, obj, act) against loaded policies.
   * Lazy-initializes the enforcer on first call.
   */
  async enforce(orgId: string, sub: string, obj: string, act: string): Promise<boolean> {
    const enforcer = await this._getEnforcer();
    return enforcer.enforce(orgId, sub, obj, act);
  }

  /**
   * hasRuleFor — returns true if ANY policy row exists for this org + sub + obj.
   * Used by checkCasbinGate to distinguish "deny" from "no opinion" (fall-through).
   * Checks direct subject and roles inherited within the same org.
   */
  async hasRuleFor(orgId: string, sub: string, obj: string): Promise<boolean> {
    const enforcer = await this._getEnforcer();
    const policies = await enforcer.getPolicy();
    const roles = await enforcer.getImplicitRolesForUser(sub, orgId);
    const subjects = new Set([sub, ...roles]);
    return policies.some((rule) => rule[0] === orgId && subjects.has(rule[1] ?? "") && rule[2] === obj);
  }

  /**
   * reload — force policy reload from DB (call after addPolicy/removePolicy).
   */
  async reload(): Promise<void> {
    if (this._enforcer) {
      await this._enforcer.loadPolicy();
    }
  }

  /** Lazy-init the casbin Enforcer with the DB adapter. */
  private async _getEnforcer(): Promise<Enforcer> {
    if (!this._enforcer) {
      const model = newModel(RBAC_MODEL_TEXT);
      this._enforcer = await newEnforcer(model, this._adapter);
    }
    return this._enforcer;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// checkCasbinGate — utility consumed by assertPermission middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * checkCasbinGate — evaluates casbin enforcement for a tRPC request.
 *
 * Logic:
 *   1. enforce(org, sub, obj, act) → true → allow (return without throwing).
 *   2. enforce → false + hasRuleFor(org, sub, obj) → true → explicit deny → FORBIDDEN.
 *   3. enforce → false + hasRuleFor → false → no opinion → fall through (return).
 *
 * @param svc       - CasbinEnforcerService instance.
 * @param orgId     - Organization namespace.
 * @param userId    - Subject (caller's userId).
 * @param resource  - Object (resource type, e.g. "task", "document").
 * @param action    - Action (e.g. "read", "write", "delete").
 * @throws TRPCError(FORBIDDEN) when Casbin explicitly denies.
 */
export async function checkCasbinGate(
  svc: CasbinEnforcerService,
  orgId: string,
  userId: string,
  resource: string,
  action: string,
): Promise<void> {
  const allowed = await svc.enforce(orgId, userId, resource, action);
  if (allowed) {
    // Casbin allows — pass through
    return;
  }

  const hasRule = await svc.hasRuleFor(orgId, userId, resource);
  if (hasRule) {
    // Casbin has a rule for this subject+resource but didn't allow → explicit deny
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Access denied: user '${userId}' does not have permission to '${action}' on '${resource}' in org '${orgId}'.`,
    });
  }

  // No casbin rule for this subject+resource → fall through to Better-Auth
}
