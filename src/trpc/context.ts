/**
 * tRPC context — carries { orgId, userId, session, em, container } on every request.
 *
 * createContext() is called by:
 *   1. SvelteKit fetchRequestHandler — event.locals already populated by hooks.server.ts.
 *   2. CLI in-process caller — builds a synthetic Request with session from SeedService.
 *   3. TUI in-process caller — same as CLI (Pillar 15).
 *   4. Test callers — mock context built directly from this type.
 *
 * C8: needle-di Container included so tRPC procedures can resolve services lazily.
 * C7: EntityManager (forked per request in web, shared in CLI/TUI) is the entry point.
 * C6: No raw SQL.
 */

import type { Container } from "@needle-di/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { Session } from "better-auth";

/**
 * The tRPC context type.
 * Downstream pillars may augment this via module augmentation in their own slices;
 * the canonical shape lives here.
 */
export interface TRPCContext {
  /** Authenticated session from Better-Auth — null when unauthenticated. */
  session: Session | null;

  /** Derived from session.activeOrganizationId ?? session.orgId. Null when unauthenticated. */
  orgId: string | null;

  /** Derived from session.userId. Null when unauthenticated. */
  userId: string | null;

  /** MikroORM EntityManager (forked per request in SvelteKit, shared in CLI/TUI). */
  em: EntityManager | null;

  /** needle-di Container — use inject(Token) or container.get(Token) inside procedures. */
  container: Container | null;
}

/**
 * CreateContextOptions — input to createContext() in each adapter.
 * SvelteKit passes event.locals; CLI/TUI pass their own derived values.
 */
export interface CreateContextOptions {
  session: Session | null;
  orgId: string | null;
  userId: string | null;
  em: EntityManager | null;
  container: Container | null;
}

/**
 * createContext — assembles the tRPC context from the adapter's inputs.
 * Called once per request by the fetch adapter / in-process caller.
 */
export function createContext(opts: CreateContextOptions): TRPCContext {
  return {
    session: opts.session,
    orgId: opts.orgId,
    userId: opts.userId,
    em: opts.em,
    container: opts.container,
  };
}
