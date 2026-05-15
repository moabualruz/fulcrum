import { DataSource } from "typeorm";
import type { SeedResult } from "@platform-core/infrastructure/application-database/seed.ts";
import type { TestOrm } from "./application-database.ts";
import type { DiContainer } from "@platform-core/application/runtime/di-container.ts";

/**
 * MikroORM compat token — tests that did `container.bind({ provide: MikroORM, ... })`
 * now bind the DataSource class instead. This symbol is also bound so old `container.get(MikroORM)`
 * still resolves.
 */
export const MikroORM = DataSource;

export type TestContainer = DiContainer & {
  __fulcrumTestSeed?: SeedResult;
};

/**
 * Minimal DiContainer backed by a Map.
 * Replaces needle-di Container after MikroORM → TypeORM migration.
 */
class SimpleContainer implements DiContainer {
  private readonly _map = new Map<unknown, unknown>();

  get<T>(token: abstract new (...args: never) => T): T;
  get(token: unknown): unknown;
  get(token: unknown): unknown {
    if (!this._map.has(token)) {
      throw new Error(`TestContainer: no binding for ${String(token)}`);
    }
    return this._map.get(token);
  }

  has(token: unknown): boolean {
    return this._map.has(token);
  }

  bind(binding: { provide: unknown; useValue: unknown }): void {
    this._map.set(binding.provide, binding.useValue);
  }
}

export function createTestContainer(input: TestOrm): TestContainer {
  const container = new SimpleContainer() as unknown as TestContainer;
  const ds: DataSource = input.ds;

  container.bind({ provide: "DataSource", useValue: ds });
  container.bind({ provide: "EntityManager", useValue: ds.manager });
  container.bind({ provide: DataSource, useValue: ds }); // MikroORM compat: tests use DataSource class as DI token

  container.__fulcrumTestSeed = input.seed;
  return container;
}

export function bindTestRuntimeDs(container: DiContainer, ds: DataSource): void {
  container.bind({ provide: "DataSource", useValue: ds });
}
