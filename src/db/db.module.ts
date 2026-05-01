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
 *   const userRepo = container.get(UserRepository);  // ← typed UserRepository subclass
 *
 * C6: No raw SQL.
 * C7: MikroORM v7 EntityManager + @Entity decorator-class entities.
 * C8: needle-di Container binds each *Repository class (custom subclass) as the
 *     injectable token — not the base EntityRepository — so inject(UserRepository)
 *     returns the typed subclass with full type inference.
 */

import { Container, InjectionToken } from "@needle-di/core";
import type { MikroORM, EntityManager } from "@mikro-orm/postgresql";

// Entity classes (decorator pattern)
import { User } from "./entities/auth/User.ts";
import { Session } from "./entities/auth/Session.ts";
import { Invitation } from "./entities/auth/Invitation.ts";
import { OrgMember } from "./entities/auth/OrgMember.ts";
import { FeatureFlag } from "./entities/auth/FeatureFlag.ts";

// Custom repository subclasses (extended EntityRepository<T>)
import { UserRepository } from "./repositories/auth/UserRepository.ts";
import { SessionRepository } from "./repositories/auth/SessionRepository.ts";
import { InvitationRepository } from "./repositories/auth/InvitationRepository.ts";
import { OrgMemberRepository } from "./repositories/auth/OrgMemberRepository.ts";
import { FeatureFlagRepository } from "./repositories/auth/FeatureFlagRepository.ts";

// Re-export repository classes for convenience (callers can use class as injection token)
export {
  UserRepository,
  SessionRepository,
  InvitationRepository,
  OrgMemberRepository,
  FeatureFlagRepository,
};

/** InjectionToken for the MikroORM EntityManager (forked per request in SvelteKit). */
export const ENTITY_MANAGER_TOKEN = new InjectionToken<EntityManager>(
  "EntityManager",
);

/**
 * Registers ORM-related bindings into the given needle-di Container.
 * Call once per process after `MikroORM.init()` completes.
 *
 * Each *Repository class is registered as its own injectable token.
 * em.getRepository(EntityClass) returns the custom subclass because
 * the entity's @Entity({ repository: () => XxxRepository }) metadata
 * wires the correct constructor — this cast is safe.
 */
export function registerDbBindings(container: Container, orm: MikroORM): void {
  const em = orm.em;

  // EntityManager — forked per request in web context, shared in CLI/TUI
  container.bind({
    provide: ENTITY_MANAGER_TOKEN,
    useValue: em,
  });

  // Auth repositories — bind custom subclass as injectable token.
  // em.getRepository(User) returns UserRepository because @Entity({ repository: () => UserRepository })
  // is wired in the entity decorator. The cast is safe: MikroORM returns the registered subclass.
  container.bind({
    provide: UserRepository,
    useFactory: () => em.getRepository(User) as UserRepository,
  });
  container.bind({
    provide: SessionRepository,
    useFactory: () => em.getRepository(Session) as SessionRepository,
  });
  container.bind({
    provide: InvitationRepository,
    useFactory: () => em.getRepository(Invitation) as InvitationRepository,
  });
  container.bind({
    provide: OrgMemberRepository,
    useFactory: () => em.getRepository(OrgMember) as OrgMemberRepository,
  });
  container.bind({
    provide: FeatureFlagRepository,
    useFactory: () => em.getRepository(FeatureFlag) as FeatureFlagRepository,
  });
}
