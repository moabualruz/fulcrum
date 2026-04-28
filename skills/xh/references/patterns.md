## Patterns

### Pattern A — the four field operators
The single most useful thing about xh:

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
JSON is the default. For form-encoded:

```bash
xh --form post example.com/login user=alice pass=hunter2
```

For raw bodies, pipe via stdin:

```bash
echo '{"raw":true}' | xh post example.com/x
xh post example.com/x @./body.json     # @file → body
```

To inline a JSON file as one field's value: `field:=@path.json`.

### Pattern C — `--check-status` for scripts
xh, like httpie, exits 0 on 4xx/5xx by default. **Always use `--check-status` in scripts.**

```bash
xh --check-status get api.example.com/health || { echo "unhealthy"; exit 1; }
```

This is the curl `--fail` analogue. Without it, your script silently treats errors as success.

### Pattern D — controlling output with `--print`
`--print=<flags>` selects what to emit. Letters: `H` request headers, `B` request body, `h` response headers, `b` response body.

```bash
xh --print=h get api.example.com/x       # response headers only (HEAD-ish)
xh --print=b get api.example.com/x       # body only — same as `xh -b`
xh --print=Hh post api.example.com/x k=v # request + response headers, no bodies
xh --headers get api.example.com/x       # alias for --print=h
xh --body    get api.example.com/x       # alias for --print=b
```

Disable colors when piping (xh auto-detects, but be explicit in scripts):

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

For repeated calls with the same credentials/cookies, use a session:

```bash
xh --session=work --auth-type=bearer --auth="$TOKEN" \
   get api.example.com/me
xh --session=work get api.example.com/projects     # token reused
xh --session-read-only=work get api.example.com/x  # don't update on Set-Cookie
```

Sessions live under `~/.config/xh/sessions/<host>/<name>.json`.

### Pattern F — uploads and downloads
Multipart upload (`@` is the file operator):

```bash
xh --multipart post api.example.com/upload \
   file@./report.pdf description='quarterly'
```

Download to disk (filename derived from URL or Content-Disposition; override with `-o`):

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
