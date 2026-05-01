import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  // TODO(P1#04 / Pillar 13 tRPC wiring / Pillar 16 web shell rebuild):
  // Wire idempotent SeedService.run() here once web owns event.locals.container.
  // Direct cross-package import from "../../../db/seed.ts" previously produced
  // a Vite SSR bundle SyntaxError, and dynamic import is not clean until the
  // web shell has the DI lifecycle. See:
  // .scratch/agent-os-vision/01-foundation-reset/issues/04-local-org-seed-and-init.md
  // User impact: web-only users who never run CLI will not have the local org
  // bootstrapped on first request; until Pillar 13/16 lands, they MUST run
  // `fulcrum init` first.
  return { activeProjectId: locals.activeProjectId };
};
