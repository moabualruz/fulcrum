---
name: xh
description: Use this skill whenever the agent or user needs to make an HTTP request from the shell — GET a URL, POST JSON to an API, check a webhook with auth, test a REST endpoint, fetch and inspect headers, or upload a file. Trigger phrases include "make an HTTP request", "POST JSON to an API", "hit this endpoint with a bearer token", "check whether a webhook returns 200", "fetch the headers of a URL", "send a multipart upload". `xh` is a Rust httpie-compatible client and is the agent-friendly default over curl when the repo doesn't already use curl pervasively — it has a JSON-first body builder, four ergonomic field operators (`=`, `:=`, `:`, `==`), `--check-status` for non-zero exit on 4xx/5xx, and clean header/body output. Skip for HTTP/3, `--unix-socket`, websockets, or scripts that already lean heavily on curl flags.
---

# xh

## When to use

- User/agent need talk to HTTP API from shell — GET, POST JSON, hit webhook, fetch headers, exercise REST endpoint, upload file.
- Script need fail on 4xx/5xx — `xh --check-status` cleaner than `curl --fail`.
- Body is JSON. xh `field=value` / `field:=42` / `header:Value` / `query==string` operators killer feature vs hand-building `-d '{"...":...}'` for curl.
- Agent pipe response into `jq` (see `skills/jq/SKILL.md`). `xh -b` (body only) right print mode for pipe.

**Skip** for: HTTP/3 (`curl --http3`), Unix-domain sockets (`curl --unix-socket`), websockets (use `websocat`), SMTP/FTP/other protocols, repos whose scripts already use curl flags pervasively (no churn diff).

## Invocation

```bash
# GET (https implicit; ":" only for explicit port)
xh httpbin.org/get
xh :8080/health                        # localhost, port 8080

# POST JSON — operators build the body
xh post api.example.com/users \
  name=Ada email=ada@example.com \
  age:=30 admin:=true tags:='["x","y"]'

# Headers (`:`), query string (`==`)
xh api.example.com/search q==rust 'X-Trace-Id:abc123'

# Body-only output, suitable for `| jq`
xh -b api.example.com/users | jq '.[] | .id'

# Fail the script on 4xx/5xx
xh --check-status post webhook.example.com/event type=ping
```

## Patterns

### Pattern A — the four field operators
Most useful thing about xh:

| Operator | Builds | Example |
|---|---|---|
| `=`  | JSON string field      | `name=Ada` → `{"name":"Ada"}` |
| `:=` | Raw JSON field         | `age:=30 admin:=true tags:='["x"]'` |
| `:`  | Header                 | `Authorization:Bearer\ $TOKEN` |
| `==` | Query string parameter | `q==rust page==2` |

Any field operator implies `--json` content type. Mix freely:

```bash
xh post api.example.com/users \
  'Authorization:Bearer '"$TOKEN" \
  page==1 \
  name=Ada age:=30
```

### Pattern B — explicit body type
JSON default. Form-encoded:

```bash
xh --form post example.com/login user=alice pass=hunter2
```

Raw bodies, pipe via stdin:

```bash
echo '{"raw":true}' | xh post example.com/x
xh post example.com/x @./body.json     # @file → body
```

Inline JSON file as one field's value: `field:=@path.json`.

### Pattern C — `--check-status` for scripts
xh, like httpie, exits 0 on 4xx/5xx by default. **Always use `--check-status` in scripts.**

```bash
xh --check-status get api.example.com/health || { echo "unhealthy"; exit 1; }
```

curl `--fail` analogue. Without it, script silent treat errors as success.

### Pattern D — controlling output with `--print`
`--print=<flags>` selects what emit. Letters: `H` request headers, `B` request body, `h` response headers, `b` response body.

```bash
xh --print=h get api.example.com/x       # response headers only (HEAD-ish)
xh --print=b get api.example.com/x       # body only — same as `xh -b`
xh --print=Hh post api.example.com/x k=v # request + response headers, no bodies
xh --headers get api.example.com/x       # alias for --print=h
xh --body    get api.example.com/x       # alias for --print=b
```

Disable colors when piping (xh auto-detect, but be explicit in scripts):

```bash
xh --no-style -b get api.example.com/x | jq .
xh --style=auto ...                       # default
```

### Pattern E — auth
```bash
xh --auth=user:pass get api.example.com/private          # basic
xh --auth-type=bearer --auth="$TOKEN" get api.example.com/me   # bearer
xh --auth-type=digest --auth=user:pass get host/private  # digest
```

Repeated calls with same credentials/cookies, use session:

```bash
xh --session=work --auth-type=bearer --auth="$TOKEN" \
   get api.example.com/me
xh --session=work get api.example.com/projects     # token reused
xh --session-read-only=work get api.example.com/x  # don't update on Set-Cookie
```

Sessions live under `~/.config/xh/sessions/<host>/<name>.json`.

### Pattern F — uploads and downloads
Multipart upload (`@` is file operator):

```bash
xh --multipart post api.example.com/upload \
   file@./report.pdf description='quarterly'
```

Download to disk (filename from URL or Content-Disposition; override with `-o`):

```bash
xh --download https://example.com/dist.tgz
xh --download -o ./out.tgz https://example.com/dist.tgz
```

### Pattern G — redirects, proxy, TLS
```bash
xh --follow --max-redirects=5 get example.com
xh --proxy=https:http://corp-proxy:8080 get https://api.example.com
xh --cert=client.pem --cert-key=client.key get https://mtls.example.com
xh --verify=no get https://staging.self-signed.example   # staging only
```

## Anti-patterns

- **Don't omit `--check-status` in scripts.** xh exits 0 on 4xx/5xx by default. Without it, failing API call look like success, script keep going. Always `--check-status` (or check `$status` from `--print=h`).
- **Don't `xh ... | jq` without `-b` / `--print=b`.** Default print mode include response headers, `jq` chokes. Pipe through `xh -b` (or `--body`).
- **Don't shell-quote field values weirdly.** `xh post host name="John Doe"` work fine — `=` builds JSON-string field. Use `:=` only for raw JSON: `count:=42`, `ok:=true`, `tags:='["a","b"]'`. Don't feed `name:='"John Doe"'` when `name="John Doe"` is what you want.
- **Don't use `--verify=no` blindly.** Disables TLS chain verification — fine for self-signed staging, but sending real prod credentials over unverified chain leaks them on MITM. Scope to one staging host.
- **Don't reach for curl by reflex.** xh covers ~95% of curl day-to-day surface (auth, headers, redirects, multipart, downloads, mTLS, proxies) with cleaner JSON ergonomics. Reach for curl only when need HTTP/3, `--unix-socket`, esoteric protocols, or surrounding script already use curl flags pervasively.
- **Don't forget implicit https.** `xh example.com` is HTTPS. Use `xh http://example.com` or `xh :8080/x` for plain HTTP / localhost ports. Don't write `xh https://example.com` everywhere — noise.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — "prefer xh over curl when the repo doesn't already use curl".
- Companion: `skills/jq/SKILL.md` — `xh -b ... | jq '...'` standard JSON pipeline.
- Upstream: <https://github.com/ducaale/xh>