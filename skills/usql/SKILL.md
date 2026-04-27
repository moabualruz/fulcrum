---
name: usql
description: Use this skill whenever the user wants to run ad-hoc SQL against a database from the shell — postgres, mysql, sqlite, mssql, oracle, snowflake, bigquery, redshift, cockroachdb, clickhouse, duckdb, and 20+ more drivers via one binary. Trigger phrases include "query a postgres / mysql / sqlite database from the shell", "run sql against any database with one tool", "connect to a database and run a query", "psql replacement that works for mysql and sqlite too", "ad-hoc database query in CI", "run a SELECT against our snowflake warehouse", "open a sqlite file and inspect tables", "run a SQL script against the staging database". Prefer this skill over installing per-database CLIs (`psql`, `mysql`, `sqlcmd`, `sqlite3`) when the same agent has to talk to more than one engine, and over hand-built scripts that wrap drivers. Skip for production migrations (use atlas / dbmate / golang-migrate / sqitch), for non-SQL stores (redis, kafka, elasticsearch), and for graphql endpoints.
---

# usql

## When to use

- The user wants to run a SQL query, script, or REPL session against any of usql's 30+ supported drivers.
- The agent needs a one-shot `SELECT` from CI or a hook script with a connection URL in hand (pass it as a positional arg or via `-f conn-url-file`).
- The user is jumping between postgres, mysql, and sqlite and wants one tool with consistent flags and history.
- The user asks for a "psql-like" experience against a non-postgres database.

**Skip** for: schema migrations (use `atlas`, `dbmate`, `golang-migrate`, `sqitch`); non-SQL stores (redis, kafka, mongo find queries — use the native client); GraphQL/REST APIs (use `xh` / `gh api`); bulk CSV import for production-scale data (use `pg_dump` / `COPY` / `mysqlimport` directly).

## Invocation

```bash
# Connect to a DSN — opens an interactive REPL
usql 'pg://user:pass@host:5432/db?sslmode=require'
usql mysql://user:pass@host/db
usql 'sqlite:///path/to/file.db'
usql 'duckdb:'                                      # in-memory duckdb

# One-shot query — no REPL, prints result and exits
usql -c 'SELECT now()' pg://...

# Run a SQL script
usql -f migrations/check.sql pg://...

# JSON output → pipe to jq (-J selects JSON; -o is OUTPUT FILE, not format)
usql -J -c 'SELECT id, name FROM users LIMIT 5' pg://... | jq '.[].name'

# Write the JSON to a file instead of stdout
usql -J -o results.json -c 'SELECT * FROM users' pg://...
```

## Patterns

### Pattern A — DSN per driver

```bash
usql 'pg://u:p@host/db?sslmode=require'             # postgres
usql 'mysql://u:p@host:3306/db?parseTime=true'      # mysql
usql 'sqlite:///abs/path.db'                        # sqlite (3 slashes for absolute)
usql 'sqlserver://u:p@host/instance?database=db'    # mssql
usql 'snowflake://u:p@account/db/schema?warehouse=W'
usql 'bigquery://project/dataset'                   # uses ADC
usql 'duckdb:'                                      # in-memory; or duckdb:///file.duckdb
```

Schemes are normalised: `postgres://`, `postgresql://`, and `pg://` all work. The driver list lives at <https://github.com/xo/usql#database-support>.

### Pattern B — one-shot vs script

```bash
usql -c 'SELECT count(*) FROM orders' pg://...                    # single statement
usql -c 'SET search_path TO app' -c 'SELECT * FROM users' pg://...# multiple, in order
usql -f cleanup.sql pg://...                                      # multi-statement file
```

Use `-f script.sql` whenever your SQL contains semicolons inside string literals — `-c` splits naively on `;`.

### Pattern C — output formats

`-o, --out FILE` is the **output destination file**, NOT a format selector. Format flags are independent:

```bash
usql            -c 'SELECT ...' pg://...    # default — psql-style aligned ASCII
usql -x         -c 'SELECT ...' pg://...    # expanded (one-row-per-line; psql \x)
usql -C         -c 'SELECT ...' pg://...    # CSV (RFC-4180-style)
usql -H         -c 'SELECT ...' pg://...    # HTML table
usql -G         -c 'SELECT ...' pg://...    # vertical
usql -A         -c 'SELECT ...' pg://...    # unaligned (no column padding)
usql -t         -c 'SELECT ...' pg://...    # tuples only (no header/footer)
usql -J         -c 'SELECT ...' pg://... | jq '.[0]'   # JSON for jq pipelines
```

Long forms: `--json`, `--csv`, `--html`, `--expanded`, `--vertical`, `--no-align`, `--tuples-only`. Combine with `-o results.json` to write to a file instead of stdout. JSON pairs naturally with the `jq` skill.

### Pattern D — switch connections inside a session

```text
usql=> \c mysql://u:p@other-host/db
usql=> \c pg://u:p@prod/db
usql=> \?         -- show all backslash commands
```

Same `\c` semantics as psql; the prompt updates to reflect the active driver.

### Pattern E — variables and parameter substitution

```bash
# Set inside the REPL
usql=> \set CUTOFF 100
usql=> SELECT * FROM orders WHERE total > :CUTOFF;

# Pass from CLI
usql --variable CUTOFF=100 -c 'SELECT * FROM orders WHERE total > :CUTOFF' pg://...
```

`:NAME` is literal substitution (psql-compatible). For untrusted input prefer driver-side prepared statements via a real client library, not usql.

### Pattern F — transactions and `\copy`

```text
usql=> \begin
usql=> UPDATE accounts SET balance = balance - 100 WHERE id = 1;
usql=> UPDATE accounts SET balance = balance + 100 WHERE id = 2;
usql=> \commit                          -- or \rollback

-- Bulk CSV in/out (psql semantics; partially emulated for non-postgres)
usql=> \copy pg://prod/db users FROM users.csv WITH (FORMAT csv, HEADER)
usql=> \copy local.db dump TO dump.csv WITH (FORMAT csv)
```

### Pattern G — discovery and metadata

```text
\d table_name          -- describe
\dt                    -- list tables
\dn                    -- list schemas
\df                    -- list functions
\timing                -- toggle query timing
\?                     -- backslash help
```

Some commands are driver-specific — `\d` works against postgres / mysql / sqlite, but coverage thins for snowflake / bigquery. Fall back to driver-native SQL (`SHOW TABLES`, `INFORMATION_SCHEMA.TABLES`) when `\d` errors.

## Anti-patterns

- **Don't put credentials in argv.** `usql 'pg://user:pass@host/db'` shows up in `ps`, shell history, and CI logs. Read the DSN from a file (`usql "$(cat conn-url)" ...`), a `.pgpass`-style file, or `~/.config/usql/config.yaml` named connections (`usql my-db`).
- **Don't rely on cross-driver SQL.** usql normalises *connection* but not *dialect* — `SHOW DATABASES` is mysql, `\l` lists databases on postgres, `LIMIT` syntax differs on mssql/oracle. Test the SQL against the target engine.
- **Don't use usql for production migrations.** No version tracking, no down-migrations, no checksum verification. Use `atlas`, `dbmate`, `golang-migrate`, or `sqitch`.
- **Don't trust `\copy` to behave identically across drivers.** It is a psql concept partially emulated for mysql/sqlite/etc.; quoting, NULL handling, and header detection differ. For large or repeatable loads use the driver's native bulk path (`COPY`, `LOAD DATA INFILE`, `bcp`).
- **Don't pass multi-statement input to `-c` when statements contain semicolons in string literals.** The split is naive (`strings.Split(input, ";")`), so `-c "INSERT INTO t VALUES ('a;b')"` corrupts. Use `-f script.sql`.
- **Don't assume connection URLs are interchangeable across drivers.** `sslmode=require` is postgres; mysql uses `tls=true`. Ports default differently (5432 / 3306 / 1433). Encoding parameters (`charset`, `client_encoding`) are driver-specific.
- **Don't pipe the default aligned output into another tool.** ASCII borders break parsers. Use `-C` (CSV) or `-J` (JSON) for downstream pipelines. Remember: `-o` writes to a file; format is selected separately.
- **Don't reach for usql when only one engine is in play and a native client is already installed.** `psql`, `sqlite3`, and `duckdb` have richer driver-specific features (psql's `\watch`, sqlite's `.dump`); usql's value is the multi-driver shape.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — data-access section ("never hard-code credentials in argv; prefer `$DATABASE_URL`").
- JSON output: `skills/jq/SKILL.md` — `usql -J | jq` is the canonical agent shape.
- Upstream: <https://github.com/xo/usql>
- Driver list: <https://github.com/xo/usql#database-support>
