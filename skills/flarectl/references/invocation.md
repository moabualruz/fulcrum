## Invocation

```bash
# Auth (preferred): scoped API token
export CF_API_TOKEN='<scoped-token>'

# Auth (legacy, account-wide — avoid)
export CF_API_KEY='<global-key>'
export CF_API_EMAIL='you@example.com'

# Sanity check — lists zones the token can see
flarectl zone list

# JSON for piping into jq
flarectl --json dns list --zone example.com | jq '.[] | select(.Type=="A")'
```

Exit codes: `0` success, `1` error. The API error message lands on stderr — capture it for diagnostics (`2> err.log` or `2>&1`).
