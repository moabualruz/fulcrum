/**
 * db.module.ts — backward-compat barrel after legacy ORM → TypeORM migration.
 *
 * Previously this file registered needle-di bindings. It now re-exports
 * TypeORM repositories so existing import paths keep compiling.
 */

export {
  OrgRepository,
  UserRepository,
  SessionRepository,
  AccountRepository,
  VerificationRepository,
  InvitationRepository,
  OrgMemberRepository,
  FeatureFlagRepository,
} from "@identity-access/infrastructure/database/repositories/auth/index.ts";

export { TaskRepository } from "@work-management/infrastructure/database/repositories/tasks/TaskRepository.ts";
export { SprintRepository } from "@work-management/infrastructure/database/repositories/tasks/SprintRepository.ts";
export { ArtifactRepository } from "@workflow-coordination/infrastructure/database/repositories/artifacts/ArtifactRepository.ts";
export { RepoRepository } from "@integration-hub/infrastructure/database/repositories/repos/RepoRepository.ts";
export { EventRepository } from "./repositories/core/EventRepository.ts";
export { TenantSettingRepository } from "./repositories/TenantSettingRepository.ts";

/** @deprecated Legacy ORM compat stub — no-op in TypeORM world */
export function registerDbBindings(_container?: unknown): void {
  // no-op: TypeORM uses DataSource injection, not needle-di bindings
}
