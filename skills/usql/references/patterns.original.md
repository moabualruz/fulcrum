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
