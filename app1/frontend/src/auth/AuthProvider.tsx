import Keycloak from 'keycloak-js'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const LOCAL_TOKEN_KEY = 'app1.local-token'

type AuthMode = 'local' | 'sso'

type AuthConfig = {
  mode: AuthMode
  keycloakUrl: string | null
  realm: string | null
  clientId: string | null
}

type Credentials = { username: string; password: string }

type AuthContextValue = {
  loading: boolean
  authenticated: boolean
  mode: AuthMode | null
  error: string | null
  login: (credentials?: Credentials) => Promise<void>
  register: (credentials: Credentials) => Promise<void>
  logout: () => Promise<void>
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { detail?: string; message?: string } | null
  return body?.detail ?? body?.message ?? `Request failed (${response.status})`
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [localToken, setLocalToken] = useState<string | null>(() => sessionStorage.getItem(LOCAL_TOKEN_KEY))
  const [ssoAuthenticated, setSsoAuthenticated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const keycloak = useRef<Keycloak | null>(null)
  const mode = config?.mode ?? null

  useEffect(() => {
    let cancelled = false

    async function initialize() {
      try {
        const response = await fetch(`${API_BASE}/api/auth/config`)
        if (!response.ok) throw new Error(await errorMessage(response))
        const nextConfig = await response.json() as AuthConfig
        if (cancelled) return
        setConfig(nextConfig)

        if (nextConfig.mode === 'sso') {
          if (!nextConfig.keycloakUrl || !nextConfig.realm || !nextConfig.clientId) {
            throw new Error('Backend returned incomplete SSO configuration')
          }
          sessionStorage.removeItem(LOCAL_TOKEN_KEY)
          setLocalToken(null)
          const client = new Keycloak({
            url: nextConfig.keycloakUrl,
            realm: nextConfig.realm,
            clientId: nextConfig.clientId,
          })
          keycloak.current = client
          const authenticated = await client.init({
            onLoad: 'check-sso',
            pkceMethod: 'S256',
            checkLoginIframe: false,
          })
          if (!cancelled) setSsoAuthenticated(authenticated)
          // Do not react to the realm-session logout signal here. Another app
          // may end the Keycloak session while this app's access token is still
          // valid. This app changes state only when that token expires and its
          // refresh attempt is rejected.
          client.onTokenExpired = () => {
            void client.updateToken(0.001).catch(async () => {
              client.clearToken()
              setSsoAuthenticated(false)
              await client.login({ redirectUri: window.location.origin })
            }).catch(caught => {
              setError(caught instanceof Error ? caught.message : 'The Keycloak session has ended')
            })
          }
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Authentication initialization failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void initialize()
    return () => { cancelled = true }
  }, [])

  const authenticateLocally = useCallback(async (operation: 'login' | 'register', credentials: Credentials) => {
    setError(null)
    const response = await fetch(`${API_BASE}/api/auth/${operation}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
    if (!response.ok) throw new Error(await errorMessage(response))
    const body = await response.json() as { accessToken: string }
    sessionStorage.setItem(LOCAL_TOKEN_KEY, body.accessToken)
    setLocalToken(body.accessToken)
  }, [])

  const login = useCallback(async (credentials?: Credentials) => {
    try {
      if (mode === 'sso') {
        await keycloak.current?.login({ redirectUri: window.location.origin })
        return
      }
      if (!credentials) throw new Error('Username and password are required')
      await authenticateLocally('login', credentials)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Login failed'
      setError(message)
      throw caught
    }
  }, [authenticateLocally, mode])

  const register = useCallback(async (credentials: Credentials) => {
    try {
      await authenticateLocally('register', credentials)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Registration failed'
      setError(message)
      throw caught
    }
  }, [authenticateLocally])

  const logout = useCallback(async () => {
    setError(null)
    if (mode === 'sso') {
      await keycloak.current?.logout({ redirectUri: window.location.origin })
      return
    }
    sessionStorage.removeItem(LOCAL_TOKEN_KEY)
    setLocalToken(null)
  }, [mode])

  const authorizedFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    let token = localToken
    if (mode === 'sso' && keycloak.current) {
      try {
        // Keep using the current access token for its full two-minute lifetime.
        // A refresh is attempted only when it has expired. If another app ended
        // the realm session, Keycloak rejects the refresh and login starts again.
        // keycloak-js treats zero as its default five-second minimum validity;
        // a small positive value preserves the full access-token lifetime.
        await keycloak.current.updateToken(0.001)
        token = keycloak.current.token ?? null
      } catch (caught) {
        keycloak.current.clearToken()
        setSsoAuthenticated(false)
        await keycloak.current.login({ redirectUri: window.location.origin })
        throw caught
      }
    }
    if (!token) throw new Error('No access token is available')

    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
    if (response.status === 401) {
      if (mode === 'sso') {
        keycloak.current?.clearToken()
        setSsoAuthenticated(false)
      } else {
        sessionStorage.removeItem(LOCAL_TOKEN_KEY)
        setLocalToken(null)
      }
    }
    return response
  }, [localToken, mode])

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    authenticated: mode === 'sso' ? ssoAuthenticated : Boolean(localToken),
    mode,
    error,
    login,
    register,
    logout,
    authorizedFetch,
  }), [authorizedFetch, error, loading, localToken, login, logout, mode, register, ssoAuthenticated])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// This colocated hook is part of the provider's public API.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
