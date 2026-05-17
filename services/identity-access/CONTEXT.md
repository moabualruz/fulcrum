# Identity & Access

Bounded service that owns who a principal is (User), where they belong (Org), how they prove it (Account, Verification, Session), and what they may do (Role, OrgMember, Invitation, FeatureFlag). Wraps Better-Auth behind a NestJS service and is the single source of truth for authentication and org membership across Fulcrum.

## Language

**User**:
A human principal scoped to exactly one **Org**, identified by `(orgId, email)` and a direct `role`.
_Avoid_: Account, person, identity, profile.

**Org**:
A tenant namespace with a URL-safe `slug`; every **User**, **Session**, **Invitation**, **Verification**, and **Account** is scoped to one.
_Avoid_: Tenant, workspace, team, company.

**OrgMember**:
A join row binding a **User** to an **Org** with a membership `role` and `joinedAt`; exists in addition to the **User**'s own `role` to allow a future user to belong to multiple **Orgs**.
_Avoid_: Membership, seat, participant.

**Role**:
One of `owner`, `admin`, `member`, `guest`; carried on both **User** and **OrgMember** and enforced through the Casbin permission enforcer.
_Avoid_: Permission, group, tier, plan.

**Session**:
An opaque-token credential issued by Better-Auth, scoped to one **User** and one **Org** via `activeOrganizationId`, with `expiresAt`, `ipAddress`, and `userAgent`.
_Avoid_: Token, JWT, cookie, login.

**Account**:
A linked external credential (OAuth provider, OIDC, or stored credential password) for a **User**, keyed `(providerId, accountId)`, with encrypted `accessToken` / `refreshToken` / `idToken`.
_Avoid_: User, login, credential, provider.

**Invitation**:
A pending request to add a **User** to an **Org**, identified by a unique `token` and a target `email` + `role`, with `expiresAt` and `acceptedAt`.
_Avoid_: Invite link, request, signup.

**Verification**:
A short-lived one-time secret (email OTP code or magic-link token) scoped to an `identifier` (typically email) and **Org**, with `expiresAt`.
_Avoid_: OTP record, challenge, nonce, token.

**FeatureFlag**:
A boolean enable/disable row resolved at three scopes — global (`orgId IS NULL`, `userId IS NULL`), per-**Org**, or per-**User** — used here primarily to gate the `saas-auth` capability set.
_Avoid_: Setting, toggle, config, preference.

**AuthApplicationContext**:
The resolved per-request triple `{ userId, orgId, session }` produced from the incoming **Session** and passed into application services.
_Avoid_: Request context, principal, auth state.

**Passkey**:
A WebAuthn credential bound to a **User** for passwordless sign-in; counted on the **Session** context as `passkeyCount`.
_Avoid_: Key, WebAuthn record, FIDO credential.

**SaaS-Auth**:
The named **FeatureFlag** (`saas-auth`) that toggles OAuth providers, magic-link, and email OTP plugins on top of the always-on email/password and organization plugins.
_Avoid_: Cloud mode, hosted mode, SSO toggle.

## Relationships

- An **Org** has many **Users**; a **User** belongs to exactly one **Org** today (`(orgId, email)` unique).
- An **Org** has many **OrgMembers**; an **OrgMember** binds one **User** to one **Org** with a membership **Role** (unique on `(orgId, userId)`).
- A **User** has many **Sessions**; a **Session** belongs to exactly one **User** and one **Org**.
- A **User** has zero or more **Accounts**; an **Account** is unique on `(providerId, accountId)` and belongs to one **Org**.
- An **Org** has many **Invitations**; an **Invitation** targets one `email` + **Role** and, when accepted, produces one **OrgMember** (and a **User** if none exists for that email).
- An **Org** has many **Verifications**; a **Verification** is unique on `(identifier, value)` and is consumed once.
- A **FeatureFlag** resolves at most-specific scope: per-**User** beats per-**Org** beats global; env var `FULCRUM_FLAG_<FLAG>` overrides the DB row.
- An **AuthApplicationContext** is derived from one **Session** and exposes one **User** + one **Org** to the rest of the service.

## Example dialogue

> **Dev:** "When an **Invitation** is accepted by someone who already has a **User** in another **Org**, do we create a second **User** or just a new **OrgMember**?"
> **Domain expert:** "Today we create a new **User** — `(orgId, email)` is unique per **Org**, and a **User** is org-scoped. The **OrgMember** join exists so we can flip that later without rewriting **Session** or **Account** wiring."
> **Dev:** "And the **Role** on **User** vs **OrgMember** — which one does the Casbin enforcer read?"
> **Domain expert:** "The **OrgMember** role is authoritative for the active **Org**; **User**.`role` is the bootstrap default that matches today's one-**Org**-per-**User** invariant."

## Flagged ambiguities

- **Org vs Tenant vs Workspace** — externally we sometimes hear "tenant" (Better-Auth `organization` plugin) and "workspace" (product copy). Inside this service the term is **Org**; `Session.activeOrganizationId` is the Better-Auth-shaped alias and is not a separate concept.
- **Account vs User** — Better-Auth calls the OAuth credential row an `account`; in Fulcrum that is an **Account** (provider credential), and the human is a **User**. Never use "account" to mean the human principal.
- **Role on User vs Role on OrgMember** — both columns exist. The **OrgMember** role is the per-membership truth; **User**.`role` is a denormalized convenience for the current one-**Org**-per-**User** model and will become advisory once multi-**Org** membership lands.
- **Session vs Token vs JWT** — a **Session** is the opaque row issued by Better-Auth (`Session.id` is the cookie value). It is not a JWT and does not encode claims; do not call it a "token" in domain conversation.
- **Verification vs Invitation** — both carry an opaque secret and an `expiresAt`. A **Verification** proves possession of an `identifier` (email OTP / magic link); an **Invitation** authorises joining an **Org**. They are not interchangeable even though both are "one-time codes".
- **FeatureFlag scope here** — this service owns the `saas-auth` flag specifically. Cross-service flag *resolution* logic lives in `platform-core`'s `FlagRegistry`; the entity row lives here for historical reasons and is read directly by `AuthService`.
