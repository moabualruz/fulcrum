import { startFulcrumNestServer } from "./nest-application.ts";

export {
  createFulcrumNestApplication,
  resolveFulcrumServerPort,
  startFulcrumNestServer,
} from "./nest-application.ts";
export { appRouter } from "./trpc/router.ts";
export { createContext } from "./trpc/context.ts";
export { t } from "./trpc/trpc.ts";

// Session resolution — tRPC-free, used by CLI/TUI HTTP API callers.
export {
  buildCliTuiCallerContext,
  resolveCliTuiSession,
  resolveCliTuiSessionFromContainer,
  requireCliTuiSessionContext,
} from "./session/local-session.ts";
export type {
  CliTuiSession,
  CliTuiCallerContext,
  LocalCallerOptions,
} from "./session/local-session.ts";

if (import.meta.main) {
  await startFulcrumNestServer();
}
