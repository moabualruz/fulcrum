## When to use

- The user or agent needs to talk to an HTTP API from the shell — GET, POST JSON, hit a webhook, fetch headers, exercise a REST endpoint, upload a file.
- A script needs to fail on 4xx/5xx — `xh --check-status` is the cleaner counterpart to `curl --fail`.
- The body is JSON. xh's `field=value` / `field:=42` / `header:Value` / `query==string` operators are the killer feature versus building `-d '{"...":...}'` by hand for curl.
- The agent is piping the response into `jq` (see `skills/jq/SKILL.md`). `xh -b` (body only) is the right print mode for that pipe.

**Skip** for: HTTP/3 (`curl --http3`), Unix-domain sockets (`curl --unix-socket`), websockets (use `websocat`), SMTP/FTP/other protocols, or repos whose existing scripts already use curl flags pervasively (don't churn the diff).
