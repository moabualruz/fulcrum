# tRPC Router to NestJS Service Mapping

## Executive Summary

This document provides a comprehensive inventory of all 50 tRPC routers in the Fulcrum server application and their current state of migration to NestJS service architecture.

**Key Statistics:**
- **Total Routers:** 50
- **Total RPC Procedures:** 303 (Queries: 143 | Mutations: 155 | Subscriptions: 5)
- **Routers with NestJS Controller:** 39 (78%)
- **Routers with Application Service:** 41 (82%)
- **Using EntityManager (ctx.em):** 1 (2%)
- **Using EM Helper Functions:** 10 (20%)

## Migration Gaps

### Routers WITHOUT NestJS Controllers (11 gaps)

These routers expose tRPC endpoints but have no corresponding HTTP controller:

1. **agents** - 3 procedures (2Q + 1M)
2. **backup** - 2 procedures (2M)
3. **doc-comments** - 5 procedures (1Q + 4M)
4. **doc-links** - 0 procedures
5. **doc-templates** - 2 procedures (2Q)
6. **doc-versions** - 4 procedures (3Q + 1M)
7. **orchestration** - 16 procedures (11Q + 5M)
8. **planning** - 7 procedures (2Q + 5M)
9. **runs** - 2 procedures (2Q)
10. **saved-searches** - 4 procedures (1Q + 3M)
11. **subscriptions** - 3 procedures (3S)

**Action Required:** These 11 routers should have corresponding NestJS controllers created in the appropriate service modules.

### Controllers WITHOUT tRPC Routers (5+ potential gaps)

The following NestJS controllers exist but may not have matching tRPC routers (depending on tRPC-first vs REST-first strategy):

- feature-experiment-public-api
- settings-public-api (covers theme router currently)
- field-dependency-public-api
- doc-templates-public-api (no matching controller found)

## Detailed Router Mapping Table

| Router | Controller | ctx.em? | App Service? | Procedures | Migration Notes |
|--------|-----------|---------|-------------|-----------|-----------------|
| agent-runs | agent-run | No | No | 0 | Router-level logic only - no application service layer | Empty router - placeholder or deprecated |
| agents | **MISSING** | No | Yes | 3 | Ready to migrate |
| artifacts | artifact | No | Yes | 9 | Ready to migrate |
| audit | audit | No | Yes | 5 | Uses ctx.em - requires EntityManager injection |
| auth | auth | No | Yes | 3 | Uses ctx.em - requires EntityManager injection |
| automations | automation | No | Yes | 5 | Ready to migrate |
| backup | **MISSING** | No | Yes | 2 | Ready to migrate |
| comments | task-comment | No | Yes | 11 | Ready to migrate |
| connectors | connector | No | No | 0 | Router-level logic only - no application service layer | Empty router - placeholder or deprecated |
| credentials | credential | Yes | Yes | 6 | Uses ctx.em - requires EntityManager injection |
| custom-fields | custom-field | No | Yes | 3 | Ready to migrate |
| doc-comments | **MISSING** | No | Yes | 5 | Ready to migrate |
| doc-links | **MISSING** | No | No | 0 | Router-level logic only - no application service layer | Empty router - placeholder or deprecated |
| doc-templates | **MISSING** | No | Yes | 2 | Ready to migrate |
| doc-versions | **MISSING** | No | Yes | 4 | Ready to migrate |
| docs | document | No | Yes | 16 | Ready to migrate |
| doctor | doctor | No | No | 2 | Router-level logic only - no application service layer |
| documents | document | No | Yes | 6 | Ready to migrate |
| error-logs | error-log | No | Yes | 3 | Ready to migrate |
| flags | feature-flag | No | Yes | 9 | Ready to migrate |
| inference | inference | No | Yes | 14 | Ready to migrate |
| invitations | invitation | No | No | 0 | Router-level logic only - no application service layer | Empty router - placeholder or deprecated |
| json-import-export | data-portability | No | Yes | 3 | Ready to migrate |
| memories | memory | No | Yes | 6 | Ready to migrate |
| memory | memory | No | Yes | 7 | Uses ctx.em - requires EntityManager injection |
| notifications | notification | No | Yes | 17 | Ready to migrate |
| orchestration | **MISSING** | No | Yes | 16 | Ready to migrate |
| orgs | organization | No | Yes | 5 | Ready to migrate |
| planning | **MISSING** | No | Yes | 7 | Uses ctx.em - requires EntityManager injection |
| projects | project | No | Yes | 6 | Uses ctx.em - requires EntityManager injection |
| recurrence | task-recurrence | No | Yes | 3 | Ready to migrate |
| relationships | relationship | No | Yes | 8 | Ready to migrate |
| repo-branches | repository | No | No | 0 | Router-level logic only - no application service layer | Empty router - placeholder or deprecated |
| repo-commits | repository | No | No | 0 | Router-level logic only - no application service layer | Empty router - placeholder or deprecated |
| reports | report | No | Yes | 13 | Ready to migrate |
| repos | repository | No | Yes | 7 | Uses ctx.em - requires EntityManager injection |
| routing | routing | No | Yes | 12 | Uses ctx.em - requires EntityManager injection |
| runs | **MISSING** | No | No | 2 | Router-level logic only - no application service layer |
| saved-searches | **MISSING** | No | Yes | 4 | Ready to migrate |
| saved-views | saved-view | No | No | 0 | Router-level logic only - no application service layer | Empty router - placeholder or deprecated |
| search | search | No | Yes | 9 | Ready to migrate |
| skills | skill-supply | No | Yes | 10 | Ready to migrate |
| sprints | sprint | No | Yes | 9 | Uses ctx.em - requires EntityManager injection |
| subscriptions | **MISSING** | No | Yes | 3 | Ready to migrate |
| tasks | task | No | Yes | 18 | Uses ctx.em - requires EntityManager injection |
| telemetry | telemetry | No | Yes | 4 | Ready to migrate |
| templates | template | No | Yes | 5 | Ready to migrate |
| theme | settings | No | Yes | 5 | Ready to migrate |
| webhooks | webhook | No | Yes | 7 | Uses ctx.em - requires EntityManager injection |
| workflows | workflow-settings | No | Yes | 9 | Ready to migrate |

## Analysis by Dimension

### EntityManager Usage Patterns

**Direct ctx.em Usage (1 router):**
- credentials (2Q + 4M) - Direct EM access for credential storage/retrieval

**EM Helper Functions (10 routers):**
- audit (3Q + 2M) - requireTrpcEntityManager / optionalTrpcEntityManager
- auth (1Q + 2M)
- memory (3Q + 4M)
- planning (2Q + 5M)
- projects (3Q + 3M)
- repos (3Q + 4M)
- routing (4Q + 8M)
- sprints (2Q + 7M)
- tasks (6Q + 11M + 1S)
- webhooks (4Q + 3M)

**Migration Impact:** EM usage requires careful refactoring to inject EntityManager into NestJS providers.

### Application Service Integration

**41 routers (82%)** import application layer code from service packages like:
- @work-management/application
- @execution-orchestration/application
- @knowledge-workspace/application
- @platform-core/application
- @identity-access/application
- @integration-hub/application
- @notification-center/application
- @workflow-coordination/application

**9 routers (18%)** have router-level logic only:
- agents, backup, doc-comments, doc-links, doc-templates, doc-versions
- invitations, runs, saved-searches

### Procedure Distribution

**Largest Routers (by procedure count):**
1. tasks - 18 procedures (6Q + 11M + 1S)
2. notifications - 17 procedures (7Q + 10M)
3. orchestration - 16 procedures (11Q + 5M)
4. docs - 16 procedures (8Q + 8M)
5. inference - 14 procedures (10Q + 3M + 1S)
6. reports - 13 procedures (12Q + 1M)
7. routing - 12 procedures (4Q + 8M)
8. planning - 7 procedures (2Q + 5M)
9. memory - 7 procedures (3Q + 4M)
10. repos - 7 procedures (3Q + 4M)

**Subscription Support (3 routers):**
- inference (1 subscription)
- subscriptions (3 subscriptions)
- tasks (1 subscription)

## Copy-First Migration Strategy

For **copy-first migration**, where tRPC router logic becomes @Injectable NestJS providers:

### Phase 1: High-Priority Routers (No EM, Has App Service)
- artifacts (9 procedures)
- automations (5 procedures)
- comments (11 procedures)
- custom-fields (3 procedures)
- error-logs (3 procedures)
- flags (9 procedures)
- json-import-export (3 procedures)
- memories (6 procedures)
- notifications (17 procedures)
- orgs (5 procedures)
- recurrence (3 procedures)
- relationships (8 procedures)
- saved-searches (4 procedures)
- search (9 procedures)
- skills (10 procedures)
- telemetry (4 procedures)
- templates (5 procedures)
- theme (5 procedures)
- workflows (9 procedures)

**Total:** 142 procedures, ready to migrate with minimal refactoring.

### Phase 2: Medium-Priority Routers (EM Helpers, Has App Service)
- audit (5 procedures)
- auth (3 procedures)
- memory (7 procedures)
- planning (7 procedures)
- projects (6 procedures)
- repos (7 procedures)
- routing (12 procedures)
- sprints (9 procedures)
- tasks (18 procedures)
- webhooks (7 procedures)

**Total:** 81 procedures, requires EntityManager injection refactoring.

### Phase 3: Special Cases
- agent-runs (empty router)
- agents (no app service)
- backup (no controller)
- connectors (empty - may be delegated)
- credentials (direct ctx.em usage)
- doc-comments, doc-links, doc-templates, doc-versions (doc subsystem)
- doctor (system diagnostics)
- documents (alias for docs?)
- documents (duplicate vs docs?)
- invitations (no app service)
- orchestration (no controller, large)
- runs (no controller, no procedures)
- saved-views (empty - may be in project)
- subscriptions (3 subscriptions only)

## Router-to-Service Module Mapping

### work-management service
- Comments → task-comment-public-api.controller.ts
- Custom Fields → custom-field-public-api.controller.ts
- Projects → project-public-api.controller.ts
- Relationships → relationship-public-api.controller.ts
- Reports → report-public-api.controller.ts
- Sprints → sprint-public-api.controller.ts
- Tasks → task-public-api.controller.ts
- Templates → template-public-api.controller.ts
- Workflows → workflow-settings-public-api.controller.ts

### execution-orchestration service
- Agent Runs → agent-run-public-api.controller.ts
- Routing → routing-public-api.controller.ts

### knowledge-workspace service
- Docs → document-public-api.controller.ts
- Documents → document-public-api.controller.ts
- Memory → memory-public-api.controller.ts
- Search → search-public-api.controller.ts

### platform-core service
- Credentials → credential-public-api.controller.ts
- Doctor → doctor-public-api.controller.ts
- Error Logs → error-log-public-api.controller.ts
- Flags → feature-flag-public-api.controller.ts
- Inference → inference-public-api.controller.ts
- Skills → skill-supply-public-api.controller.ts
- Telemetry → telemetry-public-api.controller.ts

### identity-access service
- Auth → auth-public-api.controller.ts
- Invitations → invitation-public-api.controller.ts
- Orgs → organization-public-api.controller.ts

### integration-hub service
- Connectors → connector-public-api.controller.ts
- Repos → repository-public-api.controller.ts
- Webhooks → webhook-public-api.controller.ts

### notification-center service
- Notifications → notification-public-api.controller.ts

### workflow-coordination service
- Audit → audit-public-api.controller.ts
- Artifacts → artifact-public-api.controller.ts

## Migration Implementation Notes

### For Copy-First Approach:

1. **Minimal Refactoring Path:**
   - Wrap router procedure logic in @Injectable() NestJS service methods
   - Create corresponding HTTP controller methods with same signatures
   - Use dependency injection for EntityManager (via MikroORM module)
   - Maintain dual tRPC + REST endpoints during transition

2. **EntityManager Injection:**
   - Replace `ctx.em` with injected `EntityManager` from MikroORM
   - Update `requireTrpcEntityManager()` calls to use guards or decorators
   - Test EntityManager lifecycle in NestJS request context

3. **Application Service Integration:**
   - Most routers already import @work-management/application, etc.
   - These imports become constructor injections in NestJS services
   - No major refactoring of application layer required

4. **Testing Considerations:**
   - tRPC routers have minimal test coverage (mostly in .test.ts files)
   - NestJS services should use standard unit test patterns
   - Consider integration tests for controllers

5. **Gradual Migration:**
   - Phase 1: Low-risk routers (no EM, has app service)
   - Phase 2: EM helper routers (audit, auth, memory, etc.)
   - Phase 3: Special cases (doc system, orchestration, subscriptions)
   - Maintain backwards compatibility with tRPC during transition

## Files Referenced

- tRPC Routers: `/Users/mkh/workspace/fulcrum/apps/server/src/trpc/routers/*.ts`
- NestJS Controllers: `/Users/mkh/workspace/fulcrum/services/*/src/interface/http/*-public-api.controller.ts`
- Application Services: `/Users/mkh/workspace/fulcrum/services/*/src/application/*.service.ts`

## Next Steps

1. **Create Missing Controllers:** Implement HTTP controllers for 11 routers without REST exposure
2. **Create Application Services:** Extract logic from 9 routers that lack application-layer services
3. **Plan EntityManager Migration:** Design injection pattern for 10+ routers using EM helpers
4. **Batch Copy-First Migrations:** Implement Phase 1 routers (142 procedures) as pilot
5. **Monitor Dual Exposure:** Ensure tRPC + REST endpoints work during transition
