import { createContext } from "../../../../../trpc/context.ts";
import { appRouter } from "../../../../../trpc/router.ts";
import { t } from "../../../../../trpc/trpc.ts";
import type { Session } from "better-auth";

interface InferenceLocals {
  session?: Session | null;
  orgId?: string | null;
  em?: import("@mikro-orm/postgresql").EntityManager | null;
  container?: import("@needle-di/core").Container | null;
}

function createCaller(locals: InferenceLocals) {
  const factory = t.createCallerFactory(appRouter);
  return factory(createContext({
    session: locals.session ?? null,
    orgId: locals.orgId ?? null,
    userId: (locals.session as { userId?: string } | null)?.userId ?? null,
    em: locals.em ?? null,
    container: locals.container ?? null,
  }));
}

export function load({ locals }: { locals: InferenceLocals }) {
  const caller = createCaller(locals);

  return {
    streamed: {
      health: caller.inference.health(),
      models: caller.inference.models.list(),
    },
  };
}
