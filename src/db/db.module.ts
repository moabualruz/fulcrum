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
import { FlagRegistry } from "../flags/registry.ts";

// P1#19 — MigratorService + SchemaMigration ledger
import { SchemaMigration } from "./entities/SchemaMigration.ts";
import { SchemaMigrationRepository } from "./repositories/SchemaMigrationRepository.ts";
import { MigratorService } from "./migrator-service.ts";

// Entity classes (decorator pattern)
import { Org } from "./entities/auth/Org.ts";
import { User } from "./entities/auth/User.ts";
import { Session } from "./entities/auth/Session.ts";
import { Account } from "./entities/auth/Account.ts";
import { Verification } from "./entities/auth/Verification.ts";
import { Invitation } from "./entities/auth/Invitation.ts";
import { OrgMember } from "./entities/auth/OrgMember.ts";
import { FeatureFlag } from "./entities/auth/FeatureFlag.ts";
import { Event } from "./entities/core/Event.ts";

// Stub entities (P1#03 — composite index decorators landed early)
import { Task } from "./entities/tasks/Task.ts";
import { Document } from "./entities/docs/Document.ts";
import { DocLink } from "./entities/docs/DocLink.ts";
import { DocVersion } from "./entities/docs/DocVersion.ts";
import { DocComment } from "./entities/docs/DocComment.ts";
import { DocTemplate } from "./entities/docs/DocTemplate.ts";
import { Memory } from "./entities/memory/Memory.ts";
import { AgentRun } from "./entities/orchestration/AgentRun.ts";
import { RoutingRule } from "./entities/router/RoutingRule.ts";
import { Artifact } from "./entities/artifacts/Artifact.ts";
import { Repo } from "./entities/repos/Repo.ts";
import { Job } from "./entities/jobs/Job.ts";
import { SearchDocument } from "./entities/search/SearchDocument.ts";
import { FulcrumSkill } from "./entities/skills/FulcrumSkill.ts";
import { ModelCache } from "./entities/inference/ModelCache.ts";
import { ProviderCredential } from "./entities/inference/ProviderCredential.ts";

// Flag-stub entities (P1#03 — gated by later pillars' feature flags)
import { CasbinRule } from "./entities/flags/CasbinRule.ts";
import { WebhookSubscription } from "./entities/flags/WebhookSubscription.ts";
import { NotificationRule } from "./entities/flags/NotificationRule.ts";

// Custom repository subclasses (extended EntityRepository<T>)
import { OrgRepository } from "./repositories/auth/OrgRepository.ts";
import { UserRepository } from "./repositories/auth/UserRepository.ts";
import { SessionRepository } from "./repositories/auth/SessionRepository.ts";
import { AccountRepository } from "./repositories/auth/AccountRepository.ts";
import { VerificationRepository } from "./repositories/auth/VerificationRepository.ts";
import { InvitationRepository } from "./repositories/auth/InvitationRepository.ts";
import { OrgMemberRepository } from "./repositories/auth/OrgMemberRepository.ts";
import { FeatureFlagRepository } from "./repositories/auth/FeatureFlagRepository.ts";
import { EventRepository } from "./repositories/core/EventRepository.ts";

// Stub repositories
import { TaskRepository } from "./repositories/tasks/TaskRepository.ts";
import { DocumentRepository } from "./repositories/docs/DocumentRepository.ts";
import { DocLinkRepository } from "./repositories/docs/DocLinkRepository.ts";
import { DocVersionRepository } from "./repositories/docs/DocVersionRepository.ts";
import { DocCommentRepository } from "./repositories/docs/DocCommentRepository.ts";
import { DocTemplateRepository } from "./repositories/docs/DocTemplateRepository.ts";
import { MemoryRepository } from "./repositories/memory/MemoryRepository.ts";
import { AgentRunRepository } from "./repositories/orchestration/AgentRunRepository.ts";
import { RoutingRuleRepository } from "./repositories/router/RoutingRuleRepository.ts";
import { ArtifactRepository } from "./repositories/artifacts/ArtifactRepository.ts";
import { RepoRepository } from "./repositories/repos/RepoRepository.ts";
import { JobRepository } from "./repositories/jobs/JobRepository.ts";
import { SearchDocumentRepository } from "./repositories/search/SearchDocumentRepository.ts";
import { FulcrumSkillRepository } from "./repositories/skills/FulcrumSkillRepository.ts";
import { ModelCacheRepository } from "./repositories/inference/ModelCacheRepository.ts";
import { ProviderCredentialRepository } from "./repositories/inference/ProviderCredentialRepository.ts";

// Flag-stub repositories
import { CasbinRuleRepository } from "./repositories/flags/CasbinRuleRepository.ts";
import { WebhookSubscriptionRepository } from "./repositories/flags/WebhookSubscriptionRepository.ts";
import { NotificationRuleRepository } from "./repositories/flags/NotificationRuleRepository.ts";

// Re-export P1#19 additions for convenience
export { SchemaMigrationRepository, MigratorService };

// Re-export repository classes for convenience (callers can use class as injection token)
export {
  OrgRepository,
  UserRepository,
  SessionRepository,
  AccountRepository,
  VerificationRepository,
  InvitationRepository,
  OrgMemberRepository,
  FeatureFlagRepository,
  EventRepository,
  TaskRepository,
  DocumentRepository,
  DocLinkRepository,
  DocVersionRepository,
  DocCommentRepository,
  DocTemplateRepository,
  MemoryRepository,
  AgentRunRepository,
  RoutingRuleRepository,
  ArtifactRepository,
  RepoRepository,
  JobRepository,
  SearchDocumentRepository,
  FulcrumSkillRepository,
  ModelCacheRepository,
  ProviderCredentialRepository,
  CasbinRuleRepository,
  WebhookSubscriptionRepository,
  NotificationRuleRepository,
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
export function registerDbBindings(
  container: Container,
  orm: MikroORM,
  em: EntityManager = orm.em,
): void {
  // EntityManager — forked per request in web context, shared in CLI/TUI
  container.bind({
    provide: ENTITY_MANAGER_TOKEN,
    useValue: em,
  });

  // Auth repositories — bind custom subclass as injectable token.
  // em.getRepository(X) returns the typed subclass because @Entity({ repository: () => XRepository })
  // is wired in each entity decorator. The cast is safe: MikroORM returns the registered subclass.
  container.bind({
    provide: OrgRepository,
    useFactory: () => em.getRepository(Org) as OrgRepository,
  });
  container.bind({
    provide: UserRepository,
    useFactory: () => em.getRepository(User) as UserRepository,
  });
  container.bind({
    provide: SessionRepository,
    useFactory: () => em.getRepository(Session) as SessionRepository,
  });
  container.bind({
    provide: AccountRepository,
    useFactory: () => em.getRepository(Account) as AccountRepository,
  });
  container.bind({
    provide: VerificationRepository,
    useFactory: () => em.getRepository(Verification) as VerificationRepository,
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
  container.bind({
    provide: FlagRegistry,
    useFactory: () =>
      new FlagRegistry(
        em.getRepository(FeatureFlag) as FeatureFlagRepository,
      ),
  });

  // Core repositories
  container.bind({
    provide: EventRepository,
    useFactory: () => em.getRepository(Event) as EventRepository,
  });

  // Stub-tenant repositories (P1#03 — Task, Document, Memory, AgentRun, Artifact,
  // Repo, Job, SearchDocument). Later pillars consume the typed subclass.
  container.bind({
    provide: TaskRepository,
    useFactory: () => em.getRepository(Task) as TaskRepository,
  });
  container.bind({
    provide: DocumentRepository,
    useFactory: () => em.getRepository(Document) as DocumentRepository,
  });
  container.bind({
    provide: DocLinkRepository,
    useFactory: () => em.getRepository(DocLink) as DocLinkRepository,
  });
  container.bind({
    provide: DocVersionRepository,
    useFactory: () => em.getRepository(DocVersion) as DocVersionRepository,
  });
  container.bind({
    provide: DocCommentRepository,
    useFactory: () => em.getRepository(DocComment) as DocCommentRepository,
  });
  container.bind({
    provide: DocTemplateRepository,
    useFactory: () => em.getRepository(DocTemplate) as DocTemplateRepository,
  });
  container.bind({
    provide: MemoryRepository,
    useFactory: () => em.getRepository(Memory) as MemoryRepository,
  });
  container.bind({
    provide: AgentRunRepository,
    useFactory: () => em.getRepository(AgentRun) as AgentRunRepository,
  });
  container.bind({
    provide: RoutingRuleRepository,
    useFactory: () => em.getRepository(RoutingRule) as RoutingRuleRepository,
  });
  container.bind({
    provide: ArtifactRepository,
    useFactory: () => em.getRepository(Artifact) as ArtifactRepository,
  });
  container.bind({
    provide: RepoRepository,
    useFactory: () => em.getRepository(Repo) as RepoRepository,
  });
  container.bind({
    provide: JobRepository,
    useFactory: () => em.getRepository(Job) as JobRepository,
  });
  container.bind({
    provide: SearchDocumentRepository,
    useFactory: () =>
      em.getRepository(SearchDocument) as SearchDocumentRepository,
  });
  container.bind({
    provide: FulcrumSkillRepository,
    useFactory: () => em.getRepository(FulcrumSkill) as FulcrumSkillRepository,
  });
  container.bind({
    provide: ModelCacheRepository,
    useFactory: () => em.getRepository(ModelCache) as ModelCacheRepository,
  });
  container.bind({
    provide: ProviderCredentialRepository,
    useFactory: () =>
      em.getRepository(ProviderCredential) as ProviderCredentialRepository,
  });

  // Flag-stub repositories (P1#03 — CasbinRule, WebhookSubscription, NotificationRule).
  container.bind({
    provide: CasbinRuleRepository,
    useFactory: () => em.getRepository(CasbinRule) as CasbinRuleRepository,
  });
  container.bind({
    provide: WebhookSubscriptionRepository,
    useFactory: () =>
      em.getRepository(WebhookSubscription) as WebhookSubscriptionRepository,
  });
  container.bind({
    provide: NotificationRuleRepository,
    useFactory: () =>
      em.getRepository(NotificationRule) as NotificationRuleRepository,
  });

  // P1#19 — SchemaMigration ledger + MigratorService.
  // Appended last so parallel P1#02 follow-up block (if any) lands before us.
  container.bind({
    provide: SchemaMigrationRepository,
    useFactory: () =>
      em.getRepository(SchemaMigration) as SchemaMigrationRepository,
  });
  container.bind({
    provide: MigratorService,
    useFactory: () => {
      const schemaMigrationRepo = em.getRepository(
        SchemaMigration,
      ) as SchemaMigrationRepository;
      const eventRepo = em.getRepository(Event) as EventRepository;
      return new MigratorService(orm, schemaMigrationRepo, eventRepo);
    },
  });
}
