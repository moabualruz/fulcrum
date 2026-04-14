import { describe, it, expect } from 'vitest'
import {
  roleCapabilities,
  L1_ROLES,
  isL1,
  canInvokeTeams,
  canMerge,
  canWriteCode,
  canEditFiles,
} from '../roles.js'

describe('role capabilities (H-11)', () => {
  it('L1_ROLES contains chief_of_staff and only chief_of_staff', () => {
    expect(L1_ROLES.has('chief_of_staff')).toBe(true)
    expect(L1_ROLES.size).toBe(1)
  })

  it('chief_of_staff is_l1=true, can_invoke_teams=true, cannot write code or edit files', () => {
    const caps = roleCapabilities('chief_of_staff')
    expect(caps.is_l1).toBe(true)
    expect(caps.can_invoke_teams).toBe(true)
    expect(caps.can_write_code).toBe(false)
    expect(caps.can_edit_files).toBe(false)
    expect(caps.can_merge).toBe(false)
  })

  it('integration_worker can_merge=true, cannot invoke teams', () => {
    const caps = roleCapabilities('integration_worker')
    expect(caps.can_merge).toBe(true)
    expect(caps.can_invoke_teams).toBe(false)
    expect(caps.is_l1).toBe(false)
    expect(caps.can_write_code).toBe(true) // L2 implementer-level
    expect(caps.can_edit_files).toBe(true)
  })

  it('software_engineer is pure L2 implementer: no teams, no merge, yes code+edit', () => {
    const caps = roleCapabilities('software_engineer')
    expect(caps.is_l1).toBe(false)
    expect(caps.can_invoke_teams).toBe(false)
    expect(caps.can_merge).toBe(false)
    expect(caps.can_write_code).toBe(true)
    expect(caps.can_edit_files).toBe(true)
  })

  it('code_reviewer is read-only: can_write_code=false, can_edit_files=false', () => {
    const caps = roleCapabilities('code_reviewer')
    expect(caps.can_write_code).toBe(false)
    expect(caps.can_edit_files).toBe(false)
    expect(caps.can_invoke_teams).toBe(false)
    expect(caps.can_merge).toBe(false)
  })

  it('security_reviewer is read-only', () => {
    const caps = roleCapabilities('security_reviewer')
    expect(caps.can_write_code).toBe(false)
    expect(caps.can_edit_files).toBe(false)
  })

  it('isL1 / canInvokeTeams / canMerge helpers match roleCapabilities output', () => {
    expect(isL1('chief_of_staff')).toBe(true)
    expect(isL1('software_engineer')).toBe(false)
    expect(canInvokeTeams('chief_of_staff')).toBe(true)
    expect(canInvokeTeams('integration_worker')).toBe(false)
    expect(canMerge('integration_worker')).toBe(true)
    expect(canMerge('chief_of_staff')).toBe(false)
  })

  it('unknown role returns safe defaults (all false)', () => {
    const caps = roleCapabilities('custom')  // 'custom' is in the AgentRole enum
    expect(caps.is_l1).toBe(false)
    expect(caps.can_invoke_teams).toBe(false)
    expect(caps.can_merge).toBe(false)
    // custom is non-L1 L2, so write/edit default to true
    expect(caps.can_write_code).toBe(true)
    expect(caps.can_edit_files).toBe(true)
  })

  it('canWriteCode / canEditFiles helpers exist and behave as expected', () => {
    expect(canWriteCode('software_engineer')).toBe(true)
    expect(canWriteCode('chief_of_staff')).toBe(false)
    expect(canWriteCode('code_reviewer')).toBe(false)
    expect(canEditFiles('software_engineer')).toBe(true)
    expect(canEditFiles('chief_of_staff')).toBe(false)
    expect(canEditFiles('security_reviewer')).toBe(false)
  })
})
