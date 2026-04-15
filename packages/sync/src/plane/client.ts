// packages/sync/src/plane/client.ts
import type { ExternalPayload, PlaneAPIClientConfig } from '../types.js'

const MAX_RETRIES = 3

/**
 * Parse a Retry-After header value into milliseconds to wait.
 * The header can be an integer (seconds) or an HTTP-date string.
 */
function parseRetryAfterMs(headerValue: string): number {
  const asSeconds = Number(headerValue)
  if (!isNaN(asSeconds) && isFinite(asSeconds)) {
    return Math.max(0, asSeconds * 1000)
  }
  const asDate = Date.parse(headerValue)
  if (!isNaN(asDate)) {
    return Math.max(0, asDate - Date.now())
  }
  // Fallback: 1 second
  return 1000
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Perform a fetch with retry logic:
 *  - 429: honour Retry-After header (seconds or HTTP-date)
 *  - 5xx: exponential backoff starting at 1 s
 *  - Network errors: retry up to MAX_RETRIES times
 *
 * On a non-retryable HTTP error the body is written to stderr and only the
 * status code is included in the thrown Error.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let attempt = 0
  while (true) {
    let resp: Response
    try {
      resp = await fetch(url, init)
    } catch (networkErr) {
      attempt++
      if (attempt >= MAX_RETRIES) {
        throw networkErr
      }
      const backoffMs = 1000 * Math.pow(2, attempt - 1)
      await sleep(backoffMs)
      continue
    }

    if (resp.ok) {
      return resp
    }

    if (resp.status === 429 && attempt < MAX_RETRIES - 1) {
      attempt++
      const retryAfter = resp.headers.get('Retry-After')
      const waitMs = retryAfter ? parseRetryAfterMs(retryAfter) : 1000 * attempt
      await sleep(waitMs)
      continue
    }

    if (resp.status >= 500 && attempt < MAX_RETRIES - 1) {
      attempt++
      const backoffMs = 1000 * Math.pow(2, attempt - 1)
      await sleep(backoffMs)
      continue
    }

    // Non-retryable error: log body to stderr, throw with status only
    const body = await resp.text()
    process.stderr.write(`Plane API error body (status ${resp.status}): ${body}\n`)
    throw new Error(`Plane API error: ${resp.status}`)
  }
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
    return resp.json() as Promise<{ id: string }>
  }

  async getIssue(externalId: string): Promise<unknown> {
    const resp = await fetchWithRetry(
      `${this.config.baseUrl}/api/v1/workspaces/${this.config.workspaceSlug}/projects/${this.config.projectId}/issues/${externalId}/`,
      {
        headers: { 'X-API-Key': this.config.apiKey },
      },
    )
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
    return resp.json() as Promise<{ id: string }>
  }
}
