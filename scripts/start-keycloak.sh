#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYCLOAK_VERSION="${KEYCLOAK_VERSION:-26.7.2}"
KEYCLOAK_HOME="$PROJECT_DIR/.runtime/keycloak-$KEYCLOAK_VERSION"

if [[ ! -x "$KEYCLOAK_HOME/bin/kc.sh" ]]; then
  "$SCRIPT_DIR/install-keycloak.sh"
fi

mkdir -p "$KEYCLOAK_HOME/data/import"
cp "$PROJECT_DIR/keycloak/realm-auth-demo.json" "$KEYCLOAK_HOME/data/import/realm-auth-demo.json"

export KC_BOOTSTRAP_ADMIN_USERNAME="${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}"
export KC_BOOTSTRAP_ADMIN_PASSWORD="${KC_BOOTSTRAP_ADMIN_PASSWORD:-admin}"

echo "Starting Keycloak at http://localhost:8080"
exec "$KEYCLOAK_HOME/bin/kc.sh" start-dev --http-port=8080 --import-realm
