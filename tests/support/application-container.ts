import { Container } from "@needle-di/core";
import { MikroORM } from "@mikro-orm/postgresql";

import { registerDbBindings } from "@platform-core/infrastructure/application-database/db.module.ts";
import type { SeedResult } from "@platform-core/infrastructure/application-database/seed.ts";
import type { TestOrm } from "./application-database.ts";

export type TestContainer = Container & {
  __fulcrumTestSeed?: SeedResult;
};

function unwrapOrm(input: MikroORM | TestOrm): { orm: MikroORM; seed?: SeedResult } {
  if ("orm" in input) return { orm: input.orm, seed: input.seed };
  return { orm: input };
}

export function createTestContainer(input: MikroORM | TestOrm): TestContainer {
  const { orm, seed } = unwrapOrm(input);
  const container = new Container() as TestContainer;
  registerDbBindings(container, orm);
  container.__fulcrumTestSeed = seed;
  return container;
}

export function bindTestRuntimeOrm(container: Container, input: MikroORM | TestOrm): void {
  container.bind({ provide: MikroORM, useValue: unwrapOrm(input).orm });
}
