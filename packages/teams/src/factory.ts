// packages/teams/src/factory.ts
// Factory that bundles all team operations into a TeamOps implementation.
// The CLI (or any host that depends on both @fulcrum/core and @fulcrum/teams)
// calls setTeamOps(createTeamOps()) once at startup to register the implementation.

import type { TeamOps } from '@fulcrum/core'
import { getDb } from '@fulcrum/core'
import {
  createTeamTemplate,
  invokeTeam,
  heartbeatTeam,
  completeTeam,
  listTeamInstances,
  listTeamTemplates,
  getTeamStatus,
} from './teams.js'
import { canStartTeam } from './scheduler.js'

export function createTeamOps(): TeamOps {
  // Type assertions bridge the IoC gap: TeamOps uses opaque Record<string,unknown>
  // return types so @fulcrum/core stays free of a @fulcrum/teams dependency.
  // The concrete types returned by each function ARE structurally compatible.
  return {
    createTeamTemplate: (input) => createTeamTemplate(input as never) as never,
    invokeTeam:         (input) => invokeTeam(input as never) as never,
    heartbeatTeam:      (input) => heartbeatTeam(input as never) as never,
    completeTeam:       (input) => completeTeam(input as never) as never,
    listTeamInstances:  (input) => listTeamInstances(input as never) as never,
    listTeamTemplates:  (input) => listTeamTemplates((input ?? {}) as never) as never,
    getTeamStatus:      (input) => getTeamStatus(input as never) as never,
    canStartTeam:       (_db, input) => canStartTeam(getDb(), input as never) as never,
  }
}
