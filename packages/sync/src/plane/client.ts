// packages/sync/src/plane/client.ts
import type { ExternalPayload, PlaneAPIClientConfig } from '../types.js'

const REQUEST_TIMEOUT_MS = 10_000
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 500

/** Retryable fetch with AbortSignal timeout and exponential backoff (SYNC-001, SYNC-002). */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const resp = await fetch(url, { ...init, signal: controller.signal })
      clearTimeout(timer)
      // Retry on 429 (rate-limited) with Retry-After header support
      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '0', 10)
        const backoff = retryAfter > 0
          ? retryAfter * 1000
          : INITIAL_BACKOFF_MS * 2 ** attempt
        await sleep(backoff)
        lastError = new Error(`Plane API rate-limited (429)`)
        continue
      }
      // Retry on 5xx server errors
      if (resp.status >= 500 && attempt < MAX_RETRIES - 1) {
        await sleep(INITIAL_BACKOFF_MS * 2 ** attempt)
        lastError = new Error(`Plane API server error: ${resp.status}`)
        continue
      }
      return resp
    } catch (err) {
      clearTimeout(timer)
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < MAX_RETRIES - 1) {
        await sleep(INITIAL_BACKOFF_MS * 2 ** attempt)
      }
    }
  }
  throw lastError ?? new Error('Plane API request failed after retries')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class PlaneAPIClient {
  constructor(private config: PlaneAPIClientConfig) {}

  async createIssue(payload: ExternalPayload): Promise<{ id: string }> {
    const resp = await fetchWithRetry(
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
    const resp = await fetchWithRetry(
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
    const resp = await fetchWithRetry(
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
