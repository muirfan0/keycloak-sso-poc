#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://127.0.0.1:8080}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-auth-demo}"
KEYCLOAK_ADMIN_USERNAME="${KEYCLOAK_ADMIN_USERNAME:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
SSO_DEMO_USERNAME="${SSO_DEMO_USERNAME:-sso-demo}"
SSO_DEMO_PASSWORD="${SSO_DEMO_PASSWORD:-ChangeMe123!}"
REALM_FILE="$PROJECT_DIR/keycloak/realm-auth-demo.json"

for command in curl jq; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 1; }
done

admin_token="$(curl -fsS -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'client_id=admin-cli' \
  --data-urlencode 'grant_type=password' \
  --data-urlencode "username=$KEYCLOAK_ADMIN_USERNAME" \
  --data-urlencode "password=$KEYCLOAK_ADMIN_PASSWORD" | jq -er '.access_token')"

api() {
  curl -fsS -H "Authorization: Bearer $admin_token" -H 'Content-Type: application/json' "$@"
}

realm_settings="$(jq -c '{
  realm, enabled, displayName, accessTokenLifespan, ssoSessionIdleTimeout,
  ssoSessionMaxLifespan, clientSessionIdleTimeout, clientSessionMaxLifespan,
  revokeRefreshToken, refreshTokenMaxReuse
}' "$REALM_FILE")"
api -X PUT --data "$realm_settings" "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM" >/dev/null

upsert_client() {
  local client_id="$1"
  local representation uuid
  representation="$(jq -c --arg client_id "$client_id" '.clients[] | select(.clientId == $client_id)' "$REALM_FILE")"
  uuid="$(api "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/clients?clientId=$client_id" | jq -r '.[0].id // empty')"
  if [[ -n "$uuid" ]]; then
    api -X PUT --data "$representation" "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/clients/$uuid" >/dev/null
    echo "Updated Keycloak client $client_id"
  else
    api -X POST --data "$representation" "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/clients" >/dev/null
    echo "Created Keycloak client $client_id"
  fi
}

for client_id in app1-frontend app1-api app2-frontend app2-api php-frontend php-api; do
  upsert_client "$client_id"
done

demo_user_id="$(api "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/users?username=$SSO_DEMO_USERNAME&exact=true" \
  | jq -r '.[0].id // empty')"
if [[ -z "$demo_user_id" ]]; then
  demo_user="$(jq -cn --arg username "$SSO_DEMO_USERNAME" '{
    username:$username, enabled:true, emailVerified:true,
    firstName:"SSO", lastName:"Demo", email:"sso-demo@example.test"
  }')"
  api -X POST --data "$demo_user" "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/users" >/dev/null
  demo_user_id="$(api "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/users?username=$SSO_DEMO_USERNAME&exact=true" \
    | jq -er '.[0].id')"
  echo "Created demo user $SSO_DEMO_USERNAME"
fi

password_credential="$(jq -cn --arg value "$SSO_DEMO_PASSWORD" '{type:"password",value:$value,temporary:false}')"
api -X PUT --data "$password_credential" \
  "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/users/$demo_user_id/reset-password" >/dev/null
user_role="$(api "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/roles/user")"
api -X POST --data "[$user_role]" \
  "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/users/$demo_user_id/role-mappings/realm" >/dev/null
echo "Reconciled demo user $SSO_DEMO_USERNAME"

echo "Configured realm '$KEYCLOAK_REALM': 2-minute access tokens, 3-minute idle sessions, and three demo applications."
