// packages/memory/src/kuzu/client.ts
import { buildAllDDL } from './schema.js'

// kuzu is a native addon — imported dynamically to avoid load failures when L2 is inactive
let kuzuModule: typeof import('kuzu') | null = null

async function getKuzuModule(): Promise<typeof import('kuzu')> {
  if (!kuzuModule) {
    kuzuModule = await import('kuzu')
  }
  return kuzuModule
}

export interface KuzuClientOptions {
  dbPath: string
  embeddingDimensions?: number  // default 1024 (Qwen3-Embedding-0.6B)
}

export class KuzuClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private conn: any
  isReady: boolean = false

  private constructor() {}

  private _dims: number = 1024

  /** Embedding dimension count — use instead of the hardcoded 1024 sentinel. */
  get dims(): number { return this._dims }

  static async create(options: KuzuClientOptions): Promise<KuzuClient> {
    const kuzu = await getKuzuModule()
    const client = new KuzuClient()
    client._dims = options.embeddingDimensions ?? 1024
    client.db = new kuzu.Database(options.dbPath)
    client.conn = new kuzu.Connection(client.db)
    await client.initSchema()
    client.isReady = true
    return client
  }

  async query<T = Record<string, unknown>>(
    cypher: string,
    params?: Record<string, unknown>
  ): Promise<T[]> {
    let result
    if (params && Object.keys(params).length > 0) {
      const preparedStatement = await this.conn.prepare(cypher)
      result = await this.conn.execute(preparedStatement, params)
    } else {
      result = await this.conn.query(cypher)
    }
    const rows: T[] = await result.getAll() as T[]
    return rows
  }

  async initSchema(): Promise<void> {
    const allDdl = buildAllDDL(this.dims)
    const schemaDdl = allDdl.filter(d => !d.includes('CREATE_VECTOR_INDEX'))
    const vectorDdl = allDdl.filter(d => d.includes('CREATE_VECTOR_INDEX'))

    // Run node + rel table DDL first, then vector indexes
    for (const ddl of schemaDdl) {
      try {
        await this.conn.query(ddl)
      } catch (err) {
        // IF NOT EXISTS makes this safe; some Kuzu versions may still emit warnings
        const msg = (err as Error).message ?? ''
        if (!msg.includes('already exists')) {
          throw err
        }
      }
    }
    // Vector indexes are created separately and may already exist
    for (const ddl of vectorDdl) {
      try {
        await this.conn.query(ddl)
      } catch {
        // Index already exists — ignore
      }
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
    }
    this.isReady = false
  }
}

// ── Singleton management (mirrors getDb() pattern from @fulcrum/core) ────────
let _kuzuClient: KuzuClient | null = null

export function getKuzuClient(): KuzuClient | null {
  return _kuzuClient
}

export function setKuzuClient(client: KuzuClient | null): void {
  _kuzuClient = client
}
