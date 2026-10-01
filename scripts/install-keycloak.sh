#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYCLOAK_VERSION="${KEYCLOAK_VERSION:-26.7.2}"
RUNTIME_DIR="$PROJECT_DIR/.runtime"
KEYCLOAK_HOME="$RUNTIME_DIR/keycloak-$KEYCLOAK_VERSION"
ARCHIVE="$RUNTIME_DIR/keycloak-$KEYCLOAK_VERSION.tar.gz"
DOWNLOAD_URL="https://github.com/keycloak/keycloak/releases/download/$KEYCLOAK_VERSION/keycloak-$KEYCLOAK_VERSION.tar.gz"

if [[ -x "$KEYCLOAK_HOME/bin/kc.sh" ]]; then
  echo "Keycloak $KEYCLOAK_VERSION is already installed at $KEYCLOAK_HOME"
  exit 0
fi

mkdir -p "$RUNTIME_DIR"
echo "Downloading Keycloak $KEYCLOAK_VERSION..."
curl --fail --location --retry 3 --output "$ARCHIVE" "$DOWNLOAD_URL"
tar --extract --gzip --file "$ARCHIVE" --directory "$RUNTIME_DIR"

if [[ ! -x "$KEYCLOAK_HOME/bin/kc.sh" ]]; then
  echo "Keycloak installation failed: $KEYCLOAK_HOME/bin/kc.sh was not created" >&2
  exit 1
fi

echo "Installed Keycloak $KEYCLOAK_VERSION at $KEYCLOAK_HOME"

