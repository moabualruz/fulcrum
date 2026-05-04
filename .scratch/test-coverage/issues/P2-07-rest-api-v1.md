---
Status: ready-for-agent
Phase: P2
Priority: high
Test-file: tests/trpc/rest-api-v1.test.ts
Framework: bun-test
Blocked-by: [P1-01, P1-06]
---

# REST API v1 Integration Test with Auth

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(<scope>): RED — <description>`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(<scope>): GREEN — <description>`

## What to test

Integration test for `/api/v1/*` endpoints against a real server with auth headers. Unit tests exist but no integration test exercises the full HTTP stack with authentication.

## Setup

- Start dev server with `FULCRUM_REQUIRE_AUTH=1` and `PUBLIC_API=1` feature flag
- Generate a valid API token for test requests
- Use `xh` or `fetch` with `Authorization: Bearer <token>` header

## Steps

1. `GET /api/v1/tasks` without token → expect 401
2. `GET /api/v1/tasks` with valid token → expect 200 with JSON array
3. `POST /api/v1/tasks` with token and body → expect 201 with created task
4. `GET /api/v1/tasks/<id>` → expect 200 with task object
5. `PATCH /api/v1/tasks/<id>` → expect 200 with updated task
6. `DELETE /api/v1/tasks/<id>` → expect 204
7. `GET /api/v1/openapi.json` with `public-api` flag on → expect 200

## Assertions

- [ ] 401 returned for unauthenticated requests
- [ ] CRUD operations return correct HTTP status codes
- [ ] Response body matches expected JSON schema
- [ ] OpenAPI spec accessible when flag enabled
