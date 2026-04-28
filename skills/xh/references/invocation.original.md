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
