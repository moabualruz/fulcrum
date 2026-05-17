import type { EntityManager as TypeOrmEntityManager, EntityTarget, ObjectLiteral } from "typeorm";

type LegacyConnectionExecutor = {
  execute<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T>;
};

type LegacyChangeSet = {
  entity: unknown;
};

type LegacyUnitOfWork = {
  getChangeSets(): LegacyChangeSet[];
};

declare module "typeorm" {
  export type EntityName<Entity extends ObjectLiteral = ObjectLiteral> = EntityTarget<Entity>;

  interface EntityManager {
    getConnection(): LegacyConnectionExecutor;
    clear(): void;
    getReference<Entity extends ObjectLiteral>(entityClass: EntityTarget<Entity>, id: unknown): Entity;
    persist<Entity extends ObjectLiteral>(entity: Entity | Entity[]): this;
    flush(): Promise<void>;
    nativeDelete<Entity extends ObjectLiteral>(entityClass: EntityTarget<Entity>, criteria: unknown): Promise<void>;
    transactional<Result>(handler: (entityManager: TypeOrmEntityManager) => Promise<Result>): Promise<Result>;
    getUnitOfWork(): LegacyUnitOfWork;
    getMetadata(): Array<unknown> & { get(entity: Function | string): unknown };

    create<Entity extends ObjectLiteral>(entityClass: EntityTarget<Entity>, plainObject?: any): Entity;
    find<Entity extends ObjectLiteral>(entityClass: EntityTarget<Entity>, options?: any, extraOptions?: any): Promise<Entity[]>;
    findOne<Entity extends ObjectLiteral>(entityClass: EntityTarget<Entity>, options?: any, extraOptions?: any): Promise<Entity | null>;
    findOneOrFail<Entity extends ObjectLiteral>(entityClass: EntityTarget<Entity>, options?: any, extraOptions?: any): Promise<Entity>;
    findAndCount<Entity extends ObjectLiteral>(entityClass: EntityTarget<Entity>, options?: any): Promise<[Entity[], number]>;
    count<Entity extends ObjectLiteral>(entityClass: EntityTarget<Entity>, options?: any): Promise<number>;
  }

  interface Repository<Entity extends ObjectLiteral> {
    [key: string]: any;
    manager: TypeOrmEntityManager;
  }

  interface QueryRunner {
    getExecutedMigrations(): Promise<unknown[]>;
    getPendingMigrations(): Promise<unknown[]>;
  }
}

declare module "@work-management/infrastructure/database/repositories/tasks/TaskRepository.ts" {
  interface TaskRepository {
    manager: TypeOrmEntityManager;
  }
}

declare module "@work-management/infrastructure/database/repositories/tasks/SprintRepository.ts" {
  interface SprintRepository {
    manager: TypeOrmEntityManager;
  }
}
