/**
 * Backward-compatibility shim — delegates to session/local-session.ts.
 *
 * The tRPC-specific createApplicationLocalCaller remains here because
 * it is still used by the tRPC route handler and tests. Once the tRPC
 * directory is deleted entirely, this file goes with it.
 */

import type { Session as BetterAuthSession } from "better-auth";

import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

// Re-export session utilities from the tRPC-free module.
export {
  buildCliTuiCallerContext,
  resolveCliTuiAuthContextFromContainer,
  resolveCliTuiSession,
  resolveCliTuiSessionFromContainer,
  requireCliTuiSessionContext,
} from "@fulcrum/server/session/local-session.ts";
export type {
  CliTuiSession,
  CliTuiCallerContext,
  LocalCallerOptions,
} from "@fulcrum/server/session/local-session.ts";

import {
  buildCliTuiCallerContext,
  resolveCliTuiSession,
  type LocalCallerOptions,
} from "@fulcrum/server/session/local-session.ts";

/**
 * Create an in-process tRPC caller. Still needed by the web app's
 * /api/trpc route handler and integration tests.
 */
export async function createApplicationLocalCaller(options: LocalCallerOptions = {}) {
  const cliContext = await buildCliTuiCallerContext(options.container ?? null);
  const session = await resolveCliTuiSession(cliContext.em, options.userAgent);

  const { AppUnauthorizedError } = await import("@platform-core/domain/errors.ts");
  if (options.requireSession && !session) {
    throw new AppUnauthorizedError(
      options.missingSessionMessage ??
        "No active CLI session found. Run `fulcrum init` or `fulcrum auth login` first.",
    );
  }

  const orgId = session?.activeOrganizationId ?? session?.orgId ?? null;
  const userId = session?.userId ?? null;
  const createCaller = t.createCallerFactory(appRouter);
  return createCaller(
    createContext({
      session: session as unknown as BetterAuthSession | null,
      orgId,
      userId,
      em: cliContext.em,
      container: cliContext.container,
    }),
  );
}
