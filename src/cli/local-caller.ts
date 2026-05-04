import { appRouter } from "../trpc/router.ts";
import { createContext } from "../trpc/context.ts";
import { t } from "../trpc/trpc.ts";

export async function createLocalCaller() {
  const createCaller = t.createCallerFactory(appRouter);
  return createCaller(
    createContext({
      session: null,
      orgId: null,
      userId: null,
      em: null,
      container: null,
    }),
  );
}
