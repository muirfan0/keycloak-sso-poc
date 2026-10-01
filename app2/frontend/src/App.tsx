import { useEffect, useState, type SyntheticEvent } from 'react'
import { useAuth } from './auth/AuthProvider'

type Profile = {
  subject: string
  username: string
  issuer: string
  claims: Record<string, unknown>
}

export default function App() {
  const auth = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { authenticated, authorizedFetch } = auth

  useEffect(() => {
    if (!authenticated) return
    let cancelled = false
    authorizedFetch('/api/me')
      .then(async response => {
        if (!response.ok) throw new Error(`Profile request failed (${response.status})`)
        return response.json() as Promise<Profile>
      })
      .then(value => { if (!cancelled) setProfile(value) })
      .catch(error => { if (!cancelled) setRequestError(error.message) })
    return () => { cancelled = true }
  }, [authenticated, authorizedFetch])

  async function submit(event: SyntheticEvent, operation: 'login' | 'register') {
    event.preventDefault()
    setSubmitting(true)
    setRequestError(null)
    try {
      await auth[operation]({ username, password })
      setPassword('')
    } catch {
      // AuthProvider exposes a user-facing error.
    } finally {
      setSubmitting(false)
    }
  }

  if (auth.loading) {
    return <main className="shell"><section className="card"><p className="eyebrow">APP 2 · AUTH GATEWAY</p><h1>Loading authentication…</h1></section></main>
  }

  return (
    <main className="shell">
      <section className="card">
        <div className="header">
          <div>
            <p className="eyebrow">APP 2 · AUTH GATEWAY</p>
            <h1>{auth.authenticated ? `Welcome to App 2, ${profile?.username ?? 'user'}` : 'App 2. Two trust paths.'}</h1>
          </div>
          <span className={`mode mode-${auth.mode}`}>{auth.mode === 'sso' ? 'Keycloak SSO' : 'Built-in auth'}</span>
        </div>

        {(auth.error || requestError) && <p className="error" role="alert">{auth.error ?? requestError}</p>}

        {!auth.authenticated && auth.mode === 'sso' && (
          <div className="content">
            <p>Your organization manages access through Keycloak. Continue to the identity provider to sign in.</p>
            <button className="primary" onClick={() => void auth.login()}>Continue with SSO</button>
          </div>
        )}

        {!auth.authenticated && auth.mode === 'local' && (
          <form className="content" onSubmit={event => void submit(event, 'login')}>
            <label>Username<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required minLength={3} /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={12} /></label>
            <div className="actions">
              <button className="primary" type="submit" disabled={submitting}>Sign in</button>
              <button className="secondary" type="button" disabled={submitting} onClick={event => void submit(event, 'register')}>Create account</button>
            </div>
            <p className="hint">Passwords must contain at least 12 characters.</p>
          </form>
        )}

        {auth.authenticated && (
          <div className="content">
            <div className="profile-grid">
              <span>Subject</span><code>{profile?.subject ?? 'Loading…'}</code>
              <span>Issuer</span><code>{profile?.issuer ?? 'Loading…'}</code>
            </div>
            <div className="actions">
              <a className="secondary link-button" href="http://localhost:8090">Open PHP App</a>
              <button className="secondary" onClick={() => void auth.logout()}>Sign out</button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
