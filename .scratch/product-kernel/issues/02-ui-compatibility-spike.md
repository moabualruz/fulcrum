# 02 — UI compatibility spike (SvelteKit + shadcn-svelte)

Status: ready-for-human
Risk tier: high
Dependencies: —
File ownership:
- `src/web/README.md`
- `package.json`

## Assumption

This task requires interactive `bunx shadcn-svelte@latest init` plus a network install of SvelteKit/Vite/Tailwind dependencies that materially change the project's runtime footprint. It crosses three thresholds: (a) interactive scaffolder, (b) sizable dependency surface area added with no offsetting product code in the same task, (c) per `AGENTS.md` "documentation retrieval deterministic by default" the web shell must not introduce embeddings/RAG/model deps — confirmed by the PRD but worth a human check before locking the framework choice.

Acceptance criteria (when run by a human):
- Svelte/Vite/SvelteKit/adapter-node + lucide/clsx/tailwind-merge install cleanly.
- `bunx shadcn-svelte@latest init` succeeds with SvelteKit + TypeScript + Tailwind + components under `src/web/lib/components/ui`.
- `src/web/README.md` records framework choice, no-React rule, and "no third-party app UI as base".
- `bun run --bun tsc --noEmit` stays green.
- `rg -n "export const load|<script|product-kernel|agent_runs|tasks|documents" src/web` returns nothing (no product behavior in this spike).

Reason for `ready-for-human`: interactive scaffolder + framework lock-in. The autonomous run will not merge a framework choice without explicit human approval.
