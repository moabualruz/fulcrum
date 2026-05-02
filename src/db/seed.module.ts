import type { Container } from "@needle-di/core";

import { ENTITY_MANAGER_TOKEN } from "./db.module.ts";
import { SeedService } from "./seed.ts";

export function registerSeedBindings(container: Container): void {
  container.bind({
    provide: SeedService,
    useFactory: () => new SeedService(container.get(ENTITY_MANAGER_TOKEN)),
  });
}
