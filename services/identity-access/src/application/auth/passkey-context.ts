import { AuthService } from "@identity-access/application/auth/index.ts";
import { initDataSource } from "@platform-core/infrastructure/application-database/typeorm.config.ts";

export type BetterAuthPasskeyContext = Awaited<ReturnType<typeof loadBetterAuthPasskeyContext>>;

let authContextPromise: Promise<unknown> | null = null;

export async function loadBetterAuthPasskeyContext(): Promise<unknown> {
  if (!authContextPromise) {
    authContextPromise = (async () => {
      const dataSource = await initDataSource();
      const service = new AuthService(dataSource.manager);
      await service.init();
      return service.instance.$context;
    })();
  }
  return authContextPromise;
}
