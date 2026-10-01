<?php
declare(strict_types=1);

ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax');
session_start();

$config = [
    'ssoEnabled' => filter_var(getenv('AUTH_SSO_ENABLED') ?: 'false', FILTER_VALIDATE_BOOL),
    'issuer' => rtrim(getenv('KEYCLOAK_URL') ?: 'http://127.0.0.1:8080', '/')
        . '/realms/' . (getenv('KEYCLOAK_REALM') ?: 'auth-demo'),
    'webClientId' => getenv('KEYCLOAK_CLIENT_ID') ?: 'php-frontend',
    'apiClientId' => getenv('KEYCLOAK_AUDIENCE') ?: 'php-api',
    'apiClientSecret' => getenv('KEYCLOAK_API_SECRET') ?: 'php-api-demo-secret-change-me',
    'localUsername' => getenv('AUTH_LOCAL_USERNAME') ?: 'php-demo',
    'localPassword' => getenv('AUTH_LOCAL_PASSWORD') ?: 'ChangeMe123!',
];

if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if ($path === '/api/status') {
    json_response([
        'application' => 'PHP Demo App',
        'authentication' => $config['ssoEnabled'] ? 'keycloak' : 'local',
        'realm' => $config['ssoEnabled'] ? basename($config['issuer']) : null,
        'status' => 'UP',
    ]);
}

if ($path === '/api/local-login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    if ($config['ssoEnabled']) {
        json_response(['error' => 'Local login is disabled while SSO is enabled'], 409);
    }
    if (!hash_equals($config['localUsername'], (string) ($_POST['username'] ?? ''))
        || !hash_equals($config['localPassword'], (string) ($_POST['password'] ?? ''))) {
        json_response(['error' => 'Invalid username or password'], 401);
    }
    session_regenerate_id(true);
    $_SESSION['local_user'] = $config['localUsername'];
    json_response(['authenticated' => true]);
}

if ($path === '/api/logout' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $cookie = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $cookie['path'], $cookie['domain'],
            (bool) $cookie['secure'], (bool) $cookie['httponly']);
    }
    session_destroy();
    json_response(['authenticated' => false]);
}

if ($path === '/api/me') {
    if (!$config['ssoEnabled']) {
        if (empty($_SESSION['local_user'])) {
            json_response(['error' => 'Unauthorized'], 401);
        }
        json_response([
            'subject' => 'local:' . $_SESSION['local_user'],
            'username' => $_SESSION['local_user'],
            'issuer' => 'php-demo-local',
            'authorities' => ['ROLE_USER'],
            'application' => 'PHP Demo App',
        ]);
    }

    $token = bearer_token();
    if ($token === null) {
        json_response(['error' => 'Missing bearer token'], 401);
    }
    $claims = introspect($token, $config);
    validate_contract($claims, $config);
    $roles = $claims['realm_access']['roles'] ?? [];
    json_response([
        'subject' => $claims['sub'],
        'username' => $claims['preferred_username'] ?? '',
        'issuer' => $claims['iss'],
        'authorities' => array_values(array_map(
            static fn (mixed $role): string => 'ROLE_' . strtoupper((string) $role),
            is_array($roles) ? $roles : []
        )),
        'application' => 'PHP Demo App',
    ]);
}

if (str_starts_with($path, '/api/')) {
    json_response(['error' => 'Not found'], 404);
}

function introspect(string $token, array $config): array
{
    $cacheKey = hash('sha256', $token);
    $cached = $_SESSION['sso_introspection'][$cacheKey] ?? null;
    if (is_array($cached) && ($cached['expires_at'] ?? 0) > time()) {
        return $cached['claims'];
    }

    $handle = curl_init($config['issuer'] . '/protocol/openid-connect/token/introspect');
    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POSTFIELDS => http_build_query(['token' => $token, 'token_type_hint' => 'access_token']),
        CURLOPT_HTTPAUTH => CURLAUTH_BASIC,
        CURLOPT_USERPWD => $config['apiClientId'] . ':' . $config['apiClientSecret'],
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 5,
    ]);
    $body = curl_exec($handle);
    $status = curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    if ($body === false || $status !== 200) {
        json_response(['error' => 'Keycloak token introspection failed'], 503);
    }
    $claims = json_decode($body, true);
    if (!is_array($claims) || ($claims['active'] ?? false) !== true) {
        json_response(['error' => 'The access token is inactive'], 401);
    }

    // Preserve the accepted residual-access window: after another app logs out,
    // this already-validated token remains usable only until its own exp claim.
    $expiresAt = (int) ($claims['exp'] ?? time());
    if ($expiresAt > time()) {
        $_SESSION['sso_introspection'][$cacheKey] = ['expires_at' => $expiresAt, 'claims' => $claims];
    }
    return $claims;
}

function validate_contract(array $claims, array $config): void
{
    $audiences = is_array($claims['aud'] ?? null) ? $claims['aud'] : [$claims['aud'] ?? null];
    if (($claims['iss'] ?? '') !== $config['issuer']
        || ($claims['azp'] ?? '') !== $config['webClientId']
        || !in_array($config['apiClientId'], $audiences, true)
        || empty($claims['sub'])
        || (int) ($claims['exp'] ?? 0) <= time()) {
        json_response(['error' => 'Token failed issuer, client, audience, subject, or expiry validation'], 403);
    }
}

function bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    return preg_match('/^Bearer\s+(.+)$/i', $header, $matches) ? trim($matches[1]) : null;
}

function verify_csrf(): void
{
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf'] ?? '');
    if (!is_string($provided) || !hash_equals((string) ($_SESSION['csrf'] ?? ''), $provided)) {
        json_response(['error' => 'Invalid CSRF token'], 403);
    }
}

function json_response(array $body, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

$browserConfig = [
    'enabled' => $config['ssoEnabled'],
    'issuer' => $config['issuer'],
    'clientId' => $config['webClientId'],
    'csrf' => $_SESSION['csrf'],
];
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PHP Demo · Auth Gateway</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
<main class="shell">
  <section class="card">
    <header>
      <div><p class="eyebrow">PHP APP · AUTH GATEWAY</p><h1 id="title">Loading authentication…</h1></div>
      <span id="mode" class="mode"></span>
    </header>

    <section id="loading" class="content"><p>Checking the application and identity-provider sessions.</p></section>

    <section id="local" class="content" hidden>
      <p>Keycloak is disabled, so the application’s existing local login is active.</p>
      <form id="local-form">
        <label>Username<input name="username" autocomplete="username" value="php-demo" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="primary" type="submit">Sign in</button>
      </form>
    </section>

    <section id="profile" class="content" hidden>
      <p>The PHP API validated this app’s access token and audience with Keycloak.</p>
      <pre id="claims"></pre>
      <nav>
        <a class="secondary" href="http://localhost:5173">Open App 1</a>
        <a class="secondary" href="http://localhost:5174">Open App 2</a>
        <button id="logout" class="secondary" type="button">Sign out</button>
      </nav>
    </section>

    <section id="error" class="content error" hidden>
      <p id="error-message"></p>
      <button id="retry" class="secondary" type="button">Retry</button>
    </section>
  </section>
</main>
<script>window.AUTH_CONFIG = <?= json_encode($browserConfig, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
<script src="/app.js"></script>
</body>
</html>
