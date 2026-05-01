/**
 * needle-di module — wires EntityManager + auth repositories as injectables.
 *
 * Usage:
 *   import { Container } from "@needle-di/core";
 *   import { registerDbBindings } from "./db.module.ts";
 *
 *   const container = new Container();
 *   const orm = await initOrm();
 *   registerDbBindings(container, orm);
 *
 *   const em = container.get(ENTITY_MANAGER_TOKEN);
 *
 * C6: No raw SQL.
 * C7: MikroORM v7 EntityManager.
 * C8: needle-di Container + Provider pattern (ValueProvider, FactoryProvider).
 */

import { Container, InjectionToken } from "@needle-di/core";
import type { MikroORM, EntityManager } from "@mikro-orm/postgresql";
import {
  UserSchema,
  SessionSchema,
  InvitationSchema,
  OrgMemberSchema,
  FeatureFlagSchema,
} from "./entities/auth/index.ts";
import type { InferEntity } from "@mikro-orm/postgresql";
import type { EntityRepository } from "@mikro-orm/postgresql";

/** InjectionToken for the MikroORM EntityManager (forked per request in SvelteKit). */
export const ENTITY_MANAGER_TOKEN = new InjectionToken<EntityManager>(
  "EntityManager",
);

/** InjectionToken for each auth repository. */
export const USER_REPOSITORY_TOKEN = new InjectionToken<
  EntityRepository<InferEntity<typeof UserSchema>>
>("UserRepository");

export const SESSION_REPOSITORY_TOKEN = new InjectionToken<
  EntityRepository<InferEntity<typeof SessionSchema>>
>("SessionRepository");

export const INVITATION_REPOSITORY_TOKEN = new InjectionToken<
  EntityRepository<InferEntity<typeof InvitationSchema>>
>("InvitationRepository");

export const ORG_MEMBER_REPOSITORY_TOKEN = new InjectionToken<
  EntityRepository<InferEntity<typeof OrgMemberSchema>>
>("OrgMemberRepository");

export const FEATURE_FLAG_REPOSITORY_TOKEN = new InjectionToken<
  EntityRepository<InferEntity<typeof FeatureFlagSchema>>
>("FeatureFlagRepository");

/**
 * Registers ORM-related bindings into the given needle-di Container.
 * Call once per process after `MikroORM.init()` completes.
 */
export function registerDbBindings(container: Container, orm: MikroORM): void {
  const em = orm.em;

  // EntityManager — forked per request in web context, shared in CLI/TUI
  container.bind({
    provide: ENTITY_MANAGER_TOKEN,
    useValue: em,
  });

  // Auth repositories — use em.getRepository() for proper type resolution
  container.bind({
    provide: USER_REPOSITORY_TOKEN,
    useFactory: () => em.getRepository<InferEntity<typeof UserSchema>>(UserSchema),
  });
  container.bind({
    provide: SESSION_REPOSITORY_TOKEN,
    useFactory: () =>
      em.getRepository<InferEntity<typeof SessionSchema>>(SessionSchema),
  });
  container.bind({
    provide: INVITATION_REPOSITORY_TOKEN,
    useFactory: () =>
      em.getRepository<InferEntity<typeof InvitationSchema>>(InvitationSchema),
  });
  container.bind({
    provide: ORG_MEMBER_REPOSITORY_TOKEN,
    useFactory: () =>
      em.getRepository<InferEntity<typeof OrgMemberSchema>>(OrgMemberSchema),
  });
  container.bind({
    provide: FEATURE_FLAG_REPOSITORY_TOKEN,
    useFactory: () =>
      em.getRepository<InferEntity<typeof FeatureFlagSchema>>(FeatureFlagSchema),
  });
}
