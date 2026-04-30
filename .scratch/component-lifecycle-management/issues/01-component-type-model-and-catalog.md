# 01 — Component type model and catalog skeleton

Status: done
Risk tier: low
Dependencies: —
File ownership:
- `src/components/types.ts`
- `src/components/catalog.ts`
- `src/components/catalog.test.ts`

Acceptance criteria:
- `ALL_COMPONENTS` exposes stable component ids for every managed surface (rules.global, hooks.format, …, mcp.context7).
- Component ids are unique.
- `expandProfile("profile.default")` returns members in deterministic install order.
- `getComponent("missing.component")` returns null.

## Comments
- Shipped in `b858220 feat(component): add lifecycle foundation`. Verified by `bun test src/components/catalog.test.ts`.
