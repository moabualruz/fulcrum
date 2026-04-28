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
