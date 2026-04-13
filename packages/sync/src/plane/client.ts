// packages/sync/src/plane/client.ts
import type { ExternalPayload, PlaneAPIClientConfig } from '../types.js'

export class PlaneAPIClient {
  constructor(private config: PlaneAPIClientConfig) {}

  async createIssue(payload: ExternalPayload): Promise<{ id: string }> {
    const resp = await fetch(
      `${this.config.baseUrl}/api/v1/workspaces/${this.config.workspaceSlug}/projects/${this.config.projectId}/issues/`,
      {
        method: 'POST',
        headers: {
          'X-API-Key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    )
    if (!resp.ok) {
      throw new Error(`Plane API error: ${resp.status} ${await resp.text()}`)
    }
    return resp.json() as Promise<{ id: string }>
  }

  async getIssue(externalId: string): Promise<unknown> {
    const resp = await fetch(
      `${this.config.baseUrl}/api/v1/workspaces/${this.config.workspaceSlug}/projects/${this.config.projectId}/issues/${externalId}/`,
      {
        headers: { 'X-API-Key': this.config.apiKey },
      },
    )
    if (!resp.ok) {
      throw new Error(`Plane API error: ${resp.status}`)
    }
    return resp.json()
  }

  async updateIssue(externalId: string, payload: ExternalPayload): Promise<{ id: string }> {
    const resp = await fetch(
      `${this.config.baseUrl}/api/v1/workspaces/${this.config.workspaceSlug}/projects/${this.config.projectId}/issues/${externalId}/`,
      {
        method: 'PATCH',
        headers: {
          'X-API-Key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    )
    if (!resp.ok) {
      throw new Error(`Plane API error: ${resp.status}`)
    }
    return resp.json() as Promise<{ id: string }>
  }
}
