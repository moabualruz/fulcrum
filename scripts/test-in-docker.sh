#!/usr/bin/env bash
set -euo pipefail

image="mcr.microsoft.com/playwright:v1.50-jammy"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
	echo "docker not found; install Docker to run visual regression in ${image}" >&2
	exit 127
fi

if ! docker info >/dev/null 2>&1; then
	echo "docker daemon unavailable; start Docker to run visual regression in ${image}" >&2
	exit 125
fi

args=("$@")
if [ "${#args[@]}" -eq 0 ]; then
	args=("--project=design-e2e")
else
	args=("--project=design-e2e" "${args[@]}")
fi

docker run --rm \
	--ipc=host \
	--workdir /work \
	--volume "${repo_root}:/work" \
	--env CI=1 \
	--env FULCRUM_DESIGN_E2E_PORT="${FULCRUM_DESIGN_E2E_PORT:-4200}" \
	"${image}" \
	bash -lc "corepack enable >/dev/null 2>&1 || true; bun install --frozen-lockfile; bun playwright test \"\$@\"" \
	bash "${args[@]}"
