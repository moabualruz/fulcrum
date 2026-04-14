// Type declaration for kuzu — the package ships a JS bundle without .d.ts files.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module 'kuzu' {
  export class Database {
    constructor(databasePath: string, bufferPoolSize?: number)
    close(): void
  }

  export class Connection {
    constructor(database: Database)
    close(): void
    query(queryString: string): Promise<QueryResult>
    execute(preparedStatement: PreparedStatement, params?: Record<string, unknown>): Promise<QueryResult>
    prepare(queryString: string): Promise<PreparedStatement>
  }

  export class QueryResult {
    hasNext(): boolean
    getNext(): Record<string, unknown>
    getAll(): Record<string, unknown>[]
    getColumnNames(): string[]
    close(): void
  }

  export class PreparedStatement {
    isSuccess(): boolean
    getErrorMessage(): string
  }
}
