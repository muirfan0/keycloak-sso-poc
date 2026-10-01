const config = window.AUTH_CONFIG
const tokenKey = `auth-demo:${config.clientId}`
const redirectUri = `${window.location.origin}/`
const byId = id => document.getElementById(id)

start().catch(showError)

async function start() {
  setMode(config.enabled ? 'Keycloak SSO' : 'Built-in auth', config.enabled ? 'sso' : 'local')
  if (!config.enabled) return startLocal()

  const params = new URLSearchParams(window.location.search)
  if (params.has('error')) throw new Error(params.get('error_description') || params.get('error'))
  if (params.has('code')) await finishCodeFlow(params)

  let tokens = readTokens()
  if (!tokens.access_token) return beginCodeFlow()
  if (tokenExpired(tokens.access_token)) {
    tokens = await refreshOrLogin(tokens)
    if (!tokens) return
  }

  const response = await fetch('/api/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || `Profile request failed (${response.status})`)
  }
  showProfile(await response.json())
  scheduleRefresh(tokens.access_token)
}

async function beginCodeFlow() {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(64)))
  const state = base64Url(crypto.getRandomValues(new Uint8Array(24)))
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(24)))
  const challengeBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = base64Url(new Uint8Array(challengeBytes))
  sessionStorage.setItem('php-pkce', JSON.stringify({ verifier, state, nonce }))
  const query = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  window.location.replace(`${config.issuer}/protocol/openid-connect/auth?${query}`)
}

async function finishCodeFlow(params) {
  const pending = JSON.parse(sessionStorage.getItem('php-pkce') || '{}')
  if (!pending.verifier || params.get('state') !== pending.state) {
    throw new Error('OIDC state validation failed')
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code: params.get('code'),
    redirect_uri: redirectUri,
    code_verifier: pending.verifier,
  })
  const response = await fetch(`${config.issuer}/protocol/openid-connect/token`, { method: 'POST', body })
  if (!response.ok) throw new Error('Authorization-code exchange failed')
  const tokens = await response.json()
  if (!tokens.id_token || decodeJwt(tokens.id_token).nonce !== pending.nonce) {
    throw new Error('OIDC nonce validation failed')
  }
  sessionStorage.setItem(tokenKey, JSON.stringify(tokens))
  sessionStorage.removeItem('php-pkce')
  window.history.replaceState({}, '', '/')
}

async function refreshOrLogin(tokens) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: tokens.refresh_token,
  })
  const response = await fetch(`${config.issuer}/protocol/openid-connect/token`, { method: 'POST', body })
  if (!response.ok) {
    sessionStorage.removeItem(tokenKey)
    await beginCodeFlow()
    return null
  }
  const fresh = await response.json()
  sessionStorage.setItem(tokenKey, JSON.stringify(fresh))
  return fresh
}

async function startLocal() {
  const response = await fetch('/api/me')
  if (response.ok) return showProfile(await response.json())
  show('local')
  byId('title').textContent = 'PHP app. Local login.'
  byId('local-form').onsubmit = async event => {
    event.preventDefault()
    const login = await fetch('/api/local-login', {
      method: 'POST',
      headers: { 'X-CSRF-Token': config.csrf },
      body: new URLSearchParams(new FormData(event.currentTarget)),
    })
    if (!login.ok) {
      const body = await login.json().catch(() => ({}))
      return showError(new Error(body.error || 'Invalid username or password'))
    }
    window.location.reload()
  }
}

function showProfile(user) {
  show('profile')
  byId('title').textContent = `Welcome, ${user.username || 'user'}`
  byId('claims').textContent = JSON.stringify(user, null, 2)
  byId('logout').onclick = async () => {
    const tokens = readTokens()
    await fetch('/api/logout', { method: 'POST', headers: { 'X-CSRF-Token': config.csrf } })
    if (!config.enabled) return window.location.reload()
    sessionStorage.removeItem(tokenKey)
    const query = new URLSearchParams({
      client_id: config.clientId,
      post_logout_redirect_uri: redirectUri,
    })
    if (tokens.id_token) query.set('id_token_hint', tokens.id_token)
    window.location.assign(`${config.issuer}/protocol/openid-connect/logout?${query}`)
  }
}

function showError(error) {
  show('error')
  byId('title').textContent = 'Authentication stopped.'
  byId('error-message').textContent = error instanceof Error ? error.message : String(error)
  byId('retry').onclick = () => {
    sessionStorage.removeItem(tokenKey)
    window.location.assign('/')
  }
}

function show(section) {
  for (const id of ['loading', 'local', 'profile', 'error']) byId(id).hidden = id !== section
}

function setMode(label, mode) {
  byId('mode').textContent = label
  byId('mode').className = `mode mode-${mode}`
}

function readTokens() {
  try { return JSON.parse(sessionStorage.getItem(tokenKey) || '{}') } catch { return {} }
}

function tokenExpired(token) {
  try { return decodeJwt(token).exp * 1000 <= Date.now() } catch { return true }
}

function scheduleRefresh(token) {
  try {
    const expiresAt = decodeJwt(token).exp * 1000
    window.setTimeout(() => start().catch(showError), Math.max(0, expiresAt - Date.now() + 100))
  } catch {
    // The next API action will handle an unreadable token.
  }
}

function decodeJwt(token) {
  const value = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(value.padEnd(Math.ceil(value.length / 4) * 4, '=')))
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
