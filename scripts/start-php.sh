#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR/php-app"
exec env \
  AUTH_SSO_ENABLED="${AUTH_SSO_ENABLED:-true}" \
  KEYCLOAK_URL="${KEYCLOAK_URL:-http://127.0.0.1:8080}" \
  php -S localhost:8090
