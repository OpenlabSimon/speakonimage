#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROXY_URL="${GEMINI_LIVE_PROXY_URL:-${https_proxy:-${HTTPS_PROXY:-http://127.0.0.1:7897}}}"

export GEMINI_LIVE_API_BASE_URL="${GEMINI_LIVE_API_BASE_URL:-https://generativelanguage.googleapis.com}"
export GEMINI_LIVE_WS_URL="${GEMINI_LIVE_WS_URL:-wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained}"
export GEMINI_LIVE_PROXY_URL="$PROXY_URL"
export http_proxy="$PROXY_URL"
export https_proxy="$PROXY_URL"
export NODE_USE_ENV_PROXY="${NODE_USE_ENV_PROXY:-1}"

cd "$ROOT_DIR"
exec node scripts/gemini-live-smoke.js
