import { AuthService } from "@identity-access/application/auth/index.ts";
import { initOrm } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";

export type BetterAuthPasskeyContext = Awaited<ReturnType<typeof loadBetterAuthPasskeyContext>>;

let authContextPromise: Promise<unknown> | null = null;

export async function loadBetterAuthPasskeyContext(): Promise<unknown> {
  if (!authContextPromise) {
    authContextPromise = (async () => {
      const orm = await initOrm();
      const service = new AuthService(orm.em);
      await service.init();
      return service.instance.$context;
    })();
  }
  return authContextPromise;
}
