import { Container } from "@needle-di/core";
import type { MikroORM } from "@mikro-orm/postgresql";

import { registerDbBindings } from "../db/db.module.ts";
import type { SeedResult } from "../db/seed.ts";
import type { TestOrm } from "./db.ts";

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
