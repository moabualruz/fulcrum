## Anti-patterns

- **Don't omit `--check-status` in scripts.** xh exits 0 on 4xx/5xx by default. Without it, a failing API call looks like success and the script keeps going. Always `--check-status` (or check `$status` from `--print=h`).
- **Don't `xh ... | jq` without `-b` / `--print=b`.** The default print mode includes response headers, which `jq` then chokes on. Pipe through `xh -b` (or `--body`).
- **Don't shell-quote field values weirdly.** `xh post host name="John Doe"` works fine — `=` builds a JSON-string field. Use `:=` only for raw JSON: `count:=42`, `ok:=true`, `tags:='["a","b"]'`. Don't try to feed `name:='"John Doe"'` when `name="John Doe"` is what you want.
- **Don't use `--verify=no` blindly.** It disables TLS chain verification — fine for self-signed staging, but sending real prod credentials over an unverified chain leaks them on a MITM. Scope it to the one staging host.
- **Don't reach for curl by reflex.** xh covers ~95% of curl's day-to-day surface (auth, headers, redirects, multipart, downloads, mTLS, proxies) with cleaner JSON ergonomics. Reach for curl only when you need HTTP/3, `--unix-socket`, esoteric protocols, or the surrounding script already uses curl flags pervasively.
- **Don't forget the implicit https.** `xh example.com` is HTTPS. Use `xh http://example.com` or `xh :8080/x` for plain HTTP / localhost ports. Don't write `xh https://example.com` everywhere — it's noise.
