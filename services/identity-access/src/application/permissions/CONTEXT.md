# Permissions

Sub-area that enforces what a **User** may do within an **Org** by evaluating Casbin policy rows against `(org, sub, obj, act)` requests, layered on top of the parent service's **Role** model.

## Language

**Policy**:
A `p`-typed `CasbinRule` row granting `(org, sub, obj, act)` as an allow tuple.
_Avoid_: Permission, ACL entry, grant.

**Grouping**:
A `g`-typed `CasbinRule` row binding a subject to a role within one **Org** for inheritance (`g = user, role, org`).
_Avoid_: Assignment, mapping, link.

**Subject**:
The `sub` field of a request — a `userId` or `role:<name>` string evaluated against **Policy** and **Grouping** rows.
_Avoid_: Principal, actor, sub.

**Resource**:
The `obj` field of a request — a resource-type string (e.g. `"task"`, `"document"`) or wildcard `"*"`.
_Avoid_: Object, entity, target.

**Action**:
The `act` field of a request — a verb (e.g. `"read"`, `"write"`, `"delete"`) or wildcard `"*"`.
_Avoid_: Verb, operation, op.

**Enforcer**:
The lazy-initialized `CasbinEnforcerService` singleton wrapping node-casbin's `Enforcer` over the loaded RBAC model.
_Avoid_: Engine, evaluator, checker.

**Adapter**:
`FulcrumCasbinAdapter`, the in-house casbin `Adapter` implementation that reads and writes **Policy** and **Grouping** rows through `CasbinRuleRepository` — no third-party casbin adapter package.
_Avoid_: Store, driver, backend.

**Gate**:
The `checkCasbinGate` decision function whose outcome is allow, explicit **Deny**, or **Fall-through**.
_Avoid_: Guard, check, middleware.

**Deny**:
An `enforce → false` result where `hasRuleFor(org, sub, obj)` is true; raises `AppForbiddenError`.
_Avoid_: Reject, block, forbid.

**Fall-through**:
An `enforce → false` result where no **Policy** mentions the `(org, sub, obj)` triple; the **Gate** returns silently so Better-Auth's **Role** check decides.
_Avoid_: Pass, skip, default-allow.

**CasbinPoliciesFlag**:
The `casbin-policies` **FeatureFlag** that gates whether the **Enforcer** is instantiated and the **Gate** runs at all.
_Avoid_: Casbin toggle, RBAC flag.

## Relationships

- An **Enforcer** loads its rows through one **Adapter**; the **Adapter** is the only writer of **Policy** and **Grouping** rows.
- A **Gate** call invokes the **Enforcer** once for `enforce` and, on false, once for `hasRuleFor` to choose between **Deny** and **Fall-through**.
- A **Grouping** row binds a **Subject** to a role-shaped **Subject** scoped to one **Org**; `hasRuleFor` walks implicit roles for the same **Org** before deciding.
- A **Policy**'s `org` field always matches the request **Org**; cross-**Org** matches never occur because the matcher pins `r.org == p.org`.
- The **CasbinPoliciesFlag** being off means no **Enforcer** is constructed and every request degrades to the parent service's **Role** check.

## Example dialogue

> **Dev:** "If a **Policy** denies and another **Grouping** also matches, do we still **Fall-through**?"
> **Domain expert:** "No — `hasRuleFor` returns true the moment any **Policy** or implicit role's **Policy** mentions that `(org, sub, obj)`, so the **Gate** raises **Deny**. **Fall-through** only happens when Casbin has nothing to say at all."
> **Dev:** "And a wildcard `obj = "*"` **Policy** — does that count toward `hasRuleFor`?"
> **Domain expert:** "It counts for `enforce`, but `hasRuleFor` compares `rule[2] === obj` literally, so a `"*"` row does not by itself produce **Deny**. That is intentional: wildcards grant, they do not block **Fall-through**."

## Flagged ambiguities

- **Policy vs Role** — the parent context's **Role** (`owner`/`admin`/`member`/`guest`) is a column on **User**/**OrgMember**; here a "policy" is a `CasbinRule` row. They cooperate via **Grouping** rows that map a `userId` to `role:<name>`, but they are distinct artifacts.
- **Subject vs User** — a **Subject** may be a `userId` *or* a `role:<name>` string. Never assume it resolves to a parent-context **User**.
- **Deny vs Fall-through** — both are `enforce → false`. They are not interchangeable: **Deny** throws `AppForbiddenError`; **Fall-through** returns silently and lets the outer **Role** check decide.
- **Adapter** — refers strictly to `FulcrumCasbinAdapter`. Do not use "adapter" for the parent context's Better-Auth provider plumbing inside this sub-area.
