## Invocation

```bash
# Read from stdin (most common)
<command-producing-json> | jq '<filter>'

# Read from a file
jq '<filter>' file.json

# Raw string output (no surrounding quotes)
jq -r '.field'

# Compact one-line-per-result
jq -c '.[]'

# Slurp multiple JSON values into an array
jq -s '.' file1.json file2.json

# Inject a shell value safely (string)
jq --arg name "$NAME" '.[] | select(.user == $name)'

# Inject a shell value safely (JSON)
jq --argjson cutoff 10 '.[] | select(.score >= $cutoff)'
```
