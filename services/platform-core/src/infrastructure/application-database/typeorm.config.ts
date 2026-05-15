import { DataSource, DataSourceOptions } from "typeorm";
import { PGliteDriver } from "typeorm-pglite";

const isPGlite = !process.env.DATABASE_URL;

export function createDataSourceOptions(
  extraEntities: Function[] = [],
): DataSourceOptions {
  return {
    type: "postgres",
    ...(isPGlite
      ? { driver: new PGliteDriver("./data/pglite") as any }
      : { url: process.env.DATABASE_URL }),
    entities: [...getCoreEntities(), ...extraEntities],
    migrations: [__dirname + "/migrations/*.{ts,js}"],
    synchronize: false,
    logging: process.env.TYPEORM_LOGGING === "true",
  };
}

export function getCoreEntities(): Function[] {
  // Will be populated in Task 2 as entities are converted
  return [];
}

let defaultDataSource: DataSource | undefined;

export async function initDataSource(
  options?: Partial<DataSourceOptions>,
): Promise<DataSource> {
  if (defaultDataSource?.isInitialized) return defaultDataSource;
  defaultDataSource = new DataSource({
    ...createDataSourceOptions(),
    ...options,
  } as DataSourceOptions);
  await defaultDataSource.initialize();
  return defaultDataSource;
}

export function __resetDataSourceForTest(): void {
  defaultDataSource = undefined;
}
