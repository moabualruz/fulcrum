## Anti-patterns

- **Don't put credentials in argv.** `usql 'pg://user:pass@host/db'` shows up in `ps`, shell history, and CI logs. Read the DSN from a file (`usql "$(cat conn-url)" ...`), a `.pgpass`-style file, or `~/.config/usql/config.yaml` named connections (`usql my-db`).
- **Don't rely on cross-driver SQL.** usql normalises *connection* but not *dialect* — `SHOW DATABASES` is mysql, `\l` lists databases on postgres, `LIMIT` syntax differs on mssql/oracle. Test the SQL against the target engine.
- **Don't use usql for production migrations.** No version tracking, no down-migrations, no checksum verification. Use `atlas`, `dbmate`, `golang-migrate`, or `sqitch`.
- **Don't trust `\copy` to behave identically across drivers.** It is a psql concept partially emulated for mysql/sqlite/etc.; quoting, NULL handling, and header detection differ. For large or repeatable loads use the driver's native bulk path (`COPY`, `LOAD DATA INFILE`, `bcp`).
- **Don't pass multi-statement input to `-c` when statements contain semicolons in string literals.** The split is naive (`strings.Split(input, ";")`), so `-c "INSERT INTO t VALUES ('a;b')"` corrupts. Use `-f script.sql`.
- **Don't assume connection URLs are interchangeable across drivers.** `sslmode=require` is postgres; mysql uses `tls=true`. Ports default differently (5432 / 3306 / 1433). Encoding parameters (`charset`, `client_encoding`) are driver-specific.
- **Don't pipe the default aligned output into another tool.** ASCII borders break parsers. Use `-C` (CSV) or `-J` (JSON) for downstream pipelines. Remember: `-o` writes to a file; format is selected separately.
- **Don't reach for usql when only one engine is in play and a native client is already installed.** `psql`, `sqlite3`, and `duckdb` have richer driver-specific features (psql's `\watch`, sqlite's `.dump`); usql's value is the multi-driver shape.
