## When to use

- The user wants to run a SQL query, script, or REPL session against any of usql's 30+ supported drivers.
- The agent needs a one-shot `SELECT` from CI or a hook script with a connection URL in hand (pass it as a positional arg or via `-f conn-url-file`).
- The user is jumping between postgres, mysql, and sqlite and wants one tool with consistent flags and history.
- The user asks for a "psql-like" experience against a non-postgres database.

**Skip** for: schema migrations (use `atlas`, `dbmate`, `golang-migrate`, `sqitch`); non-SQL stores (redis, kafka, mongo find queries — use the native client); GraphQL/REST APIs (use `xh` / `gh api`); bulk CSV import for production-scale data (use `pg_dump` / `COPY` / `mysqlimport` directly).
