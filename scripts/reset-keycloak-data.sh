#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYCLOAK_VERSION="${KEYCLOAK_VERSION:-26.7.2}"
KEYCLOAK_HOME="$PROJECT_DIR/.runtime/keycloak-$KEYCLOAK_VERSION"
DATA_DIR="$KEYCLOAK_HOME/data"

if [[ ! -d "$DATA_DIR" ]]; then
  echo "No Keycloak data directory exists; nothing to reset."
  exit 0
fi

BACKUP_DIR="$PROJECT_DIR/.runtime/keycloak-data-backup-$(date +%Y%m%d-%H%M%S)"
mv "$DATA_DIR" "$BACKUP_DIR"
echo "Moved the previous Keycloak data to $BACKUP_DIR"
echo "The realm will be freshly imported on the next start."

