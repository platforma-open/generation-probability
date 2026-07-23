#!/usr/bin/env bash
# Regenerate src/requirements.txt from pyproject.toml (the single source of truth).
# One definition, shared by `pnpm deps:export` and the requirements-sync CI job.
#
# --no-deps: top-level pins only. The scientific-slim runenv supplies transitive
# deps for the offline (--no-index) install, so requirements.txt must not pin a
# full closure.
set -euo pipefail
cd "$(dirname "$0")/.."
uv pip compile pyproject.toml \
  --custom-compile-command "pnpm deps:export" -o src/requirements.txt
