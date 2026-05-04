# Planning State

## Current Position

- **Phase**: 02-bug-fixes-foundation
- **Plan**: 8 plans created
- **Status**: Ready to execute
- **Branch**: dev/v1.0

## Decisions

- ARCH-09: Single Hono API at src/api/hono.ts; product-kernel/api/router.ts is deprecated shim
- ARCH-12: TrpcContext.db deprecated; em (EntityManager) is canonical data access
- Auth: Bearer API-key (SHA-256 hash) is unified REST API auth; session auth stays in web layer
- 5 duplicate isPublicApiEnabled collapsed to src/api/feature-flags.ts
- Phase 2 planning complete: 8 plans cover BUG-01..BUG-18 and FND-01..FND-07; BUG-17 remains deferred outside product/runtime execution per D-04.
