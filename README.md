# Three-application authentication and SSO demo

This repository contains two independent React + Spring Boot applications, a small PHP application, and a shared native Keycloak installation.

| Component | URL | Keycloak client/audience |
|---|---|---|
| App 1 frontend | <http://localhost:5173> | `app1-frontend` |
| App 1 backend | <http://localhost:8081> | `app1-api` |
| App 2 frontend | <http://localhost:5174> | `app2-frontend` |
| App 2 backend | <http://localhost:8082> | `app2-api` |
| PHP application | <http://localhost:8090> | `php-frontend` / `php-api` |
| Keycloak | <http://localhost:8080> | Realm: `auth-demo` |

Each application owns its own `AUTH_SSO_ENABLED` feature flag.

- With SSO disabled, each React/Spring application uses its independent H2 user database and signed local JWTs; the PHP demo uses its independent local session login.
- With SSO enabled, all three applications use the same Keycloak realm. They have separate OIDC clients and API audiences, but share the Keycloak browser session.
- A token issued to one application cannot be used against another application's API because every API validates its own audience.
- Access tokens last two minutes. Browser/client sessions have a three-minute idle timeout. After one application ends the central Keycloak session, the other applications may use their current access tokens until expiry; refresh then fails and they return to Keycloak.

## Prerequisites

- Java 21+
- Node.js 22+
- PHP 8.2+ with cURL
- `curl`, `jq`, and `tar`
- No Docker is used

## First-time installation

If you do not already have Keycloak, install it natively into the ignored `.runtime/` directory:

```bash
cd /Users/{username}/dev/pocs
./scripts/install-keycloak.sh
```

Install both frontend dependency sets:

```bash
cd /Users/{username}/dev/pocs/app1/frontend
npm install

cd /Users/{username/dev/pocs/app2/frontend
npm install
```

The Spring Boot projects include Maven Wrapper scripts, so a system Maven installation is not required.

## Run the complete SSO scenario

Use six terminals.

### Terminal 1: Keycloak (skip if already running on port 8080)

```bash
cd /Users/{username}/dev/pocs
./scripts/start-keycloak.sh
```

Wait for Keycloak to report that it is listening on port `8080`.

If you already have Keycloak running at <http://localhost:8080>, do not start the script above (it would conflict for the port). Import `keycloak/realm-auth-demo.json` into that Keycloak using its Admin Console at <http://localhost:8080/admin/>. In Keycloak, create the `auth-demo` realm from this file (or create the realm and use **Realm settings → Action → Partial import** to import the file). The demo realm defines both apps' clients and the `sso-demo` user. Do not overwrite an existing realm with valuable data; this is a disposable demo realm configuration.

Before starting the apps in SSO mode, confirm the realm is available. Use `127.0.0.1` if another local service has claimed IPv6 `localhost:8080`:

```bash
curl -f http://127.0.0.1:8080/realms/auth-demo/.well-known/openid-configuration
```

If the realm was imported before the PHP client or short token settings were added, update it in place:

```bash
./scripts/configure-keycloak.sh
```

If the response says `Realm does not exist`, the realm still needs to be imported. Keycloak's [realm import documentation](https://www.keycloak.org/server/importExport) also describes startup and offline CLI imports.

### Terminal 2: App 1 backend with SSO

```bash
cd /Users/{username}/dev/pocs/app1/backend
AUTH_SSO_ENABLED=true ./mvnw spring-boot:run
```

### Terminal 3: App 1 frontend

```bash
cd /Users/{username}/dev/pocs/app1/frontend
npm run dev -- --host localhost
```

### Terminal 4: App 2 backend with SSO

```bash
cd /Users/{username}/dev/pocs/app2/backend
AUTH_SSO_ENABLED=true ./mvnw spring-boot:run
```

### Terminal 5: App 2 frontend

```bash
cd /Users/{username}/dev/pocs/app2/frontend
npm run dev -- --host localhost
```

### Terminal 6: PHP application with SSO

```bash
cd /Users/{username}/dev/pocs
AUTH_SSO_ENABLED=true ./scripts/start-php.sh
```

Test the browser SSO flow:

1. Open <http://localhost:5173>.
2. Select **Continue with SSO**.
3. Sign in with `sso-demo` / `ChangeMe123!`.
4. Open <http://localhost:5174> in the same browser profile.
5. App 2 may briefly redirect through Keycloak, but it should return authenticated without showing the login form.
6. Open <http://localhost:8090>. It should also return authenticated without asking for credentials.

To demonstrate bounded logout propagation, keep App 2 and PHP open and sign out from App 1. The other applications can continue with their current tokens. Within two minutes those tokens expire, refresh is rejected because the shared Keycloak session ended, and both applications return to Keycloak.

The Keycloak admin console is <http://localhost:8080/admin/>. Development credentials are `admin` / `admin`.

## Run all applications with independent local login

Keycloak is not needed in local mode.

### App 1 backend

```bash
cd /Users/{username}/dev/pocs/app1/backend
AUTH_SSO_ENABLED=false ./mvnw spring-boot:run
```

### App 1 frontend

```bash
cd /Users/{username}/dev/pocs/app1/frontend
npm run dev -- --host localhost
```

### App 2 backend

```bash
cd /Users/{username}/dev/pocs/app2/backend
AUTH_SSO_ENABLED=false ./mvnw spring-boot:run
```

### App 2 frontend

```bash
cd /Users/{username}/dev/pocs/app2/frontend
npm run dev -- --host localhost
```

### PHP application

```bash
cd /Users/{username}/dev/pocs
AUTH_SSO_ENABLED=false ./scripts/start-php.sh
```

The PHP local-demo credentials are `php-demo` / `ChangeMe123!` by default. Override them with `AUTH_LOCAL_USERNAME` and `AUTH_LOCAL_PASSWORD`.

Create an account independently in each application. Creating an App 1 account does not create an App 2 account.

## Updating the feature flags

The feature flags are server environment variables and are read at startup. Stop and restart the affected Spring backend or PHP server after changing them.

All apps in SSO mode:

```bash
cd /Users/{username}/dev/pocs/app1/backend
AUTH_SSO_ENABLED=true ./mvnw spring-boot:run

cd /Users/{username}/dev/pocs/app2/backend
AUTH_SSO_ENABLED=true ./mvnw spring-boot:run

# From the repository root
AUTH_SSO_ENABLED=true ./scripts/start-php.sh
```

All apps in local mode:

```bash
cd /Users/{username}/dev/pocs/app1/backend
AUTH_SSO_ENABLED=false ./mvnw spring-boot:run

cd /Users/{username}/dev/pocs/app2/backend
AUTH_SSO_ENABLED=false ./mvnw spring-boot:run

# From the repository root
AUTH_SSO_ENABLED=false ./scripts/start-php.sh
```

A mixed rollout is also supported. For example, App 1 can use SSO while App 2 still uses local authentication:

```bash
# App 1
AUTH_SSO_ENABLED=true ./mvnw spring-boot:run

# App 2, from its backend directory
AUTH_SSO_ENABLED=false ./mvnw spring-boot:run
```

Check the live setting:

```bash
curl http://localhost:8081/api/auth/config
curl http://localhost:8082/api/auth/config
curl http://localhost:8090/api/status
```

The React applications do not contain a feature flag. They retrieve the selected mode from their own backend on page load.

## Reimporting the Keycloak realm

Keycloak does not overwrite an already-imported realm during ordinary startup. After changing `keycloak/realm-auth-demo.json`, stop Keycloak and run:

```bash
cd /Users/{username}/dev/pocs
./scripts/reset-keycloak-data.sh
./scripts/start-keycloak.sh
```

The reset script moves the previous data to a timestamped backup under `.runtime/` instead of deleting it.

## Verification

```bash
cd /Users/{usename}/dev/pocs/app1/backend && ./mvnw test
cd /Users/{username}/dev/pocs/app2/backend && ./mvnw test
cd /Users/{username}/dev/pocs/app1/frontend && npm run lint && npm run build
cd /Users/{username}/dev/pocs/app2/frontend && npm run lint && npm run build
cd /Users/{username}/dev/pocs && php -l php-app/index.php
```

## Adding other applications

Create a distinct Keycloak client for every application. Browser clients should use Authorization Code with PKCE. Server-rendered PHP applications should normally use confidential clients and keep client secrets on the server. Each API should receive a distinct audience and validate issuer, signature, timestamps, and audience.

For production, replace all demo credentials and local signing secrets, use HTTPS and exact redirect URIs, configure a production Keycloak database, and add the missing local-auth lifecycle features such as password reset, email verification, rate limiting, lockout, refresh-token rotation, and MFA.
