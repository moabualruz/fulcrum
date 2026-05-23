# Auth

Application sub-area that wires Better-Auth into the identity-access service: TypeORM-backed credential storage, request-scope org resolution, invitation lifecycle, passkey enrollment, and the per-request `AuthApplicationContext → SessionContextDto` bridge.

## Language

**AuthService**:
The `@Injectable()` wrapper around Better-Auth that owns `init()`, `handler`, and rebuilds itself when the `saas-auth` flag signature changes.
_Avoid_: AuthModule, BetterAuthService, AuthClient.

**TypeOrmBetterAuthAdapter**:
The Better-Auth `CustomAdapter` implementation that translates Better-Auth model names (`user`, `session`, `account`, `verification`, `member`, `invitation`) into TypeORM entity calls.
_Avoid_: Repository, DBAdapter, BetterAuthRepository.

**AuthConfigSignature**:
A deterministic JSON hash of `saas-auth` state, runtime mode, secrets, and OAuth client config; rebuilt every request and used to detect when `AuthService` must rebuild its Better-Auth instance.
_Avoid_: AuthFingerprint, config hash, version key.

**LocalAdminEmailNormalization**:
The two-way mapping between `DEFAULT_ADMIN_EMAIL` (the seeded principal) and `admin@local.fulcrum` (the email Better-Auth sees on the wire), applied in `adapter.findOne` reads and `normalizeLocalSignInRequest` writes.
_Avoid_: admin alias, email rewrite, sign-in shim.

**FieldMap**:
A per-model `Record<string, string>` mapping Better-Auth camelCase column names to TypeORM entity property names (e.g. `image → avatarUrl`, `organizationId → orgId`).
_Avoid_: Schema map, column mapping, translator.

**InMemoryStore**:
The adapter's fallback store for Better-Auth model names that have no TypeORM entity (e.g. rate-limit).
_Avoid_: cache, scratch store, memory adapter.

**RequestScopeReferences**:
The `{ orgId, projectId, taskId, runId }` envelope passed to `resolveRequestOrgId`; the **Org** is resolved from the first non-null hint, with `Project → Task → AgentRun` as inference fallbacks.
_Avoid_: RequestContext, scope hints, route params.

**PasskeyStore**:
The persistence port (`saveChallenge`, `getChallenge`, `listCredentialsByUser`, `saveCredential`, `updateCredentialCounter`) used by passkey flows; `TypeOrmPasskeyStore` overlays it on `Account` (`providerId = "passkey"`) and `Verification` rows.
_Avoid_: PasskeyRepository, WebAuthnDB.

**PasskeyChallenge**:
A short-lived registration/authentication nonce keyed by `(challengeId, purpose)`, stored as a `Verification` row with identifier prefix `passkey:<purpose>:<id>`.
_Avoid_: WebAuthn challenge, OTP, registration token.

## Relationships

- An **AuthService** owns one **TypeOrmBetterAuthAdapter** plus its **AuthConfigSignature**; a signature mismatch triggers a Better-Auth rebuild on next request.
- A **TypeOrmBetterAuthAdapter** routes each Better-Auth model through its **FieldMap**; unknown models fall through to **InMemoryStore**.
- A **LocalAdminEmailNormalization** is applied on both sides: outbound `mapUserToBetterAuth` keeps the seeded address, inbound `normalizeLocalSignInRequest` and `findOne` reads rewrite the wire email.
- A **RequestScopeReferences** envelope resolves to one **Org** via `resolveOrgId`; without hints it falls back to `DEFAULT_ORG_ID`.
- A **PasskeyStore** stores **PasskeyChallenges** as `Verification` rows and credentials as `Account` rows with `providerId = "passkey"`, so passkey counts surface naturally on `SessionContextDto.passkeyCount`.

## Example dialogue

> **Dev:** "Why does `AuthService` rebuild its Better-Auth instance every time the **AuthConfigSignature** changes — can't we just hot-toggle the `saas-auth` plugins?"
> **Domain expert:** "Better-Auth bakes plugins into the instance at `betterAuth({...})` time; there's no live toggle. The **AuthConfigSignature** is how we notice a flag flip, an OAuth secret rotation, or an origin change between requests without restarting the process."
> **Dev:** "And the **LocalAdminEmailNormalization** — why two layers?"
> **Domain expert:** "The wire email `admin@local.fulcrum` is what Better-Auth's schema validation accepts; the seeded `DEFAULT_ADMIN_EMAIL` is what the rest of Fulcrum stores. We rewrite at the HTTP boundary and again in adapter reads so neither side sees the other's spelling."

## Flagged ambiguities

- **AuthApplicationContext vs SessionContextDto** — both are defined in `@identity-access/domain/identity.ts` and used together here. **AuthApplicationContext** is the inbound triple this sub-area consumes; **SessionContextDto** is the resolved envelope this sub-area produces via `resolveApplicationSessionContext`. They are not interchangeable.
- **PasskeyStore challenges vs Verification rows** — a passkey **PasskeyChallenge** is physically a `Verification` row, but its `identifier` is namespaced `passkey:<purpose>:<id>` to avoid colliding with email OTP / magic-link verifications.
- **saas-auth flag resolution lives in two places** — `isFlagEnabled` in `index.ts` reads the DB-backed `FeatureFlag` row with env override; `isSaasAuthFeatureEnabled` in `saas-auth-feature.ts` reads only env (`FULCRUM_FLAG_SAAS_AUTH` or `FULCRUM_FEATURES`). The env-only helper is for non-request paths that have no `EntityManager`.
