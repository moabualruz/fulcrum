// packages/sync/src/plane/adapter.ts
import type { ExternalPayload, SyncAdapter } from '../types.js'
import { PlaneAPIClient } from './client.js'

function mapStatusToPlane(status: string): string {
  const map: Record<string, string> = {
    open: 'Backlog',
    in_progress: 'In Progress',
    done: 'Done',
    cancelled: 'Cancelled',
  }
  return map[status] ?? 'Backlog'
}

function mapPlaneStateToStatus(state: string): string {
  const map: Record<string, string> = {
    Backlog: 'open',
    'In Progress': 'in_progress',
    Done: 'done',
    Cancelled: 'cancelled',
  }
  return map[state] ?? 'open'
}

export class PlaneSyncAdapter implements SyncAdapter {
  constructor(private client: PlaneAPIClient) {}

  async push(obj: Record<string, unknown>): Promise<string> {
    const payload = this.map(obj)
    if (obj['external_id']) {
      const result = await this.client.updateIssue(obj['external_id'] as string, payload)
      return result.id
    }
    const result = await this.client.createIssue(payload)
    return result.id
  }

  async pull(externalId: string): Promise<unknown> {
    return this.client.getIssue(externalId)
  }

  map(local: Record<string, unknown>): ExternalPayload {
    // Maps Fulcrum Issue fields → Plane issue payload
    return {
      name: local['title'],
      description_html: local['description'] ?? '',
      state: mapStatusToPlane(local['status'] as string),
      priority: local['priority'] ?? 'none',
    }
  }

  unmap(external: unknown): Record<string, unknown> {
    const e = external as Record<string, unknown>
    return {
      title: e['name'],
      description: e['description_html'],
      status: mapPlaneStateToStatus(e['state'] as string),
      priority: e['priority'],
    }
  }
}
