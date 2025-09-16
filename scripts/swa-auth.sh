#!/usr/bin/env bash
set -euo pipefail

# Load .env if present (simple KEY=VALUE lines). We intentionally auto-export.
if [ -f .env ]; then
  echo "[swa-auth] Loading .env"
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
else
  echo "[swa-auth] .env not found (continuing without it)"
fi

# Ensure required vars exist (warn, don't hard fail to allow anonymous local dev)
: "${AAD_CLIENT_ID:=}" || true
# Client secret optional for public client flows
: "${AAD_CLIENT_SECRET:=}" || true

if [ -z "$AAD_CLIENT_ID" ]; then
  echo "[swa-auth] WARNING: AAD_CLIENT_ID not set; AAD login will fail."
fi

# Start SWA emulator using root script (frontend workspace dev server auto-started by config)
# If you want verbose output, set SWA_VERBOSE=1 before running.
CMD=(swa start dev)
if [ "${SWA_VERBOSE:-}" = "1" ]; then
  CMD+=(--verbose)
fi

echo "[swa-auth] Starting SWA CLI: ${CMD[*]}"
exec "${CMD[@]}"
