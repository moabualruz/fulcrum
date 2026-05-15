import { startFulcrumNestServer } from "./nest-application.ts";

export {
  createFulcrumNestApplication,
  resolveFulcrumServerPort,
  startFulcrumNestServer,
} from "./nest-application.ts";
export { appRouter } from "./trpc/router.ts";
export { createContext } from "./trpc/context.ts";
export { t } from "./trpc/trpc.ts";

if (import.meta.main) {
  await startFulcrumNestServer();
}
