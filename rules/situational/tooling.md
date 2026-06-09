# Tooling rules

Read when searching, transforming data, making HTTP requests, using a browser, querying databases, benchmarking, or managing long-running processes.

## Search and discovery

- Use `rg` for text search instead of recursive `grep`.
- Use file search tools or `fd` for file names instead of raw `find`.
- Use `ast-grep`, CodeGraph, ctags, or an LSP for code-shape questions.
- Use focused reads. Do not dump large files when a slice or query answers the question.

## Data and APIs

- Use `jq` for JSON.
- Use `yq` for YAML, TOML, and XML.
- Use JSON-friendly HTTP clients that fail on non-2xx status.
- Use authenticated CLIs for their platforms when available, especially `gh` for GitHub.
- For browser workflows, use a real browser tool rather than scraping an SPA shell.
- For SQL exploration, prefer one capable client when available and avoid installing per-database clients unless needed.

## Performance and processes

- Benchmark performance claims with repeatable tools such as `hyperfine`, not one `time` run.
- Use tracked background processes for servers and long tasks.
- Verify readiness with logs or health checks.
- Use persistent sessions only for stateful interactive tools that need ongoing stdin and stdout.
