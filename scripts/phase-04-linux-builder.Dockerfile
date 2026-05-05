# phase-04-linux-builder.Dockerfile
#
# Pinned Rust Linux builder image for cross-platform static build proof
# (INF-02 / D-03).  Produces linux-x64 artifacts on non-Linux hosts when
# native Linux build is unavailable.
#
# Pin: rust:1.83.0-bookworm (2025-01-09 release)
#   https://hub.docker.com/_/rust/tags?name=1.83.0
# Update this tag deliberately — it controls the reproducible build env.

FROM rust:1.83.0-bookworm

LABEL vendor="fulcrum" \
      purpose="phase-04-static-build-proof" \
      target="linux-x64"

# Install system deps needed by Bun's compile chain and Rust std lib.
RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends \
      pkg-config \
      libssl-dev \
      ca-certificates \
      curl \
      unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Bun via the official install script (pinned to 1.3.13).
RUN curl -fsSL https://bun.sh/install \
      | bash -s -- bun-v1.3.13 \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun

WORKDIR /workspace
COPY . .

# Pre-warm cargo registry so the first `bun run build-all` does not
# re-download the world inside the time budget.
RUN --mount=type=cache,target=/root/.cargo/registry \
    --mount=type=cache,target=/root/.cargo/git \
    cd inference && cargo fetch 2>/dev/null; true

# Default entrypoint: run the static build proof.
CMD ["bun", "run", "scripts/phase-04-static-build-proof.ts"]
