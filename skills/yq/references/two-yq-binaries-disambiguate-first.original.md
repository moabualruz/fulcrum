## Two yq binaries — disambiguate first

```bash
yq --version
# mikefarah:  "yq (https://github.com/mikefarah/yq/) version v4.x.y"
# kislyuk:    "yq 3.x.y"  (pip-installed; wraps jq)
```

This skill assumes **mikefarah/yq v4+**. If `--version` shows kislyuk, the recipes here will not work — kislyuk uses jq syntax with a `-y` flag for YAML output; mikefarah uses `.path` directly and writes YAML by default.
