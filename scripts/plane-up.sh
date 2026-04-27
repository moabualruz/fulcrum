#!/usr/bin/env bash
# Fulcrum Plane bootstrap — fetch the official Plane docker-compose.yml and bring it up locally.
# Idempotent: re-running pulls the latest compose file (does NOT clobber a pinned local edit).
#
# After first run:
#   1. Open http://localhost:3000 (or whatever PLANE_WEB_PORT resolves to)
#   2. Sign up the first user (becomes workspace owner)
#   3. Generate an API key from the UI
#   4. Save it: echo "<key>" > ~/.config/plane/key
#   5. Pin the image tag in docker-compose.yml — never run :latest in long-lived state

set -euo pipefail

PLANE_DIR="${PLANE_DIR:-$HOME/.fulcrum/plane}"
COMPOSE="$PLANE_DIR/docker-compose.yml"
ENDPOINT_FILE="$HOME/.config/plane/endpoint"
WEB_PORT="${PLANE_WEB_PORT:-3000}"
API_PORT="${PLANE_API_PORT:-8000}"

mkdir -p "$PLANE_DIR" "$HOME/.config/plane"

if [ -f "$COMPOSE" ]; then
  echo "Existing $COMPOSE — leaving it untouched (pinned tags preserved)."
  echo "Delete it manually if you want a fresh fetch."
else
  echo "Fetching Plane docker-compose.yml…"
  curl -fsSL https://raw.githubusercontent.com/makeplane/plane/master/docker-compose.yml \
    -o "$COMPOSE"
  echo "WARNING: docker-compose.yml may reference :latest — pin a tag before relying on this in long-lived state."
fi

# Endpoint config
if [ ! -f "$ENDPOINT_FILE" ]; then
  cat > "$ENDPOINT_FILE" <<EOF
PLANE_ENDPOINT=http://localhost:$API_PORT
PLANE_WEB=http://localhost:$WEB_PORT
EOF
  echo "Wrote $ENDPOINT_FILE"
fi

echo
echo "Bringing up Plane (this may take a few minutes on first run)…"
cd "$PLANE_DIR"
docker compose up -d

echo
echo "Plane should be reachable at:"
echo "  Web: http://localhost:$WEB_PORT"
echo "  API: http://localhost:$API_PORT"
echo
echo "Next steps:"
echo "  1. Open the web URL and sign up the first user."
echo "  2. Generate an API key in the Plane UI."
echo "  3. Save it: echo '<key>' > ~/.config/plane/key && chmod 600 ~/.config/plane/key"
echo "  4. Pin the image tag in $COMPOSE — never run :latest in long-lived state."
