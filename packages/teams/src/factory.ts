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
  return {
    createTeamTemplate: (input) => createTeamTemplate(input),
    invokeTeam:         (input) => invokeTeam(input),
    heartbeatTeam:      (input) => heartbeatTeam(input),
    completeTeam:       (input) => completeTeam(input),
    listTeamInstances:  (input) => listTeamInstances(input),
    listTeamTemplates:  (input) => listTeamTemplates(input ?? {}),
    getTeamStatus:      (input) => getTeamStatus(input),
    canStartTeam:       (_db, input) => canStartTeam(getDb(), input),
  }
}
