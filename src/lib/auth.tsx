import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { User as SbUser } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured, allowedDomain } from './supabase'

export interface AppUser {
  uid: string
  email: string
  displayName: string | null
  photoURL: string | null
}

interface AuthState {
  user: AppUser | null
  loading: boolean
  configured: boolean
  error: string | null
  signIn: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: false,
  configured: false,
  error: null,
  signIn: async () => {},
  logout: async () => {},
})

function toAppUser(u: SbUser | null | undefined): AppUser | null {
  if (!u) return null
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const name =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    null
  const avatar =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta.picture === 'string' && meta.picture) ||
    null
  return {
    uid: u.id,
    email: u.email ?? '',
    displayName: name || null,
    photoURL: avatar || null,
  }
}

// 허용 도메인 검증(클라이언트 측 가드). 도메인이 비어 있으면 항상 통과.
function domainOk(email: string): boolean {
  if (!allowedDomain) return true
  return email.toLowerCase().endsWith('@' + allowedDomain.toLowerCase())
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    // 세션 처리: 허용 도메인 외 계정이면 즉시 로그아웃시키고 안내.
    const handleSession = (u: SbUser | null | undefined) => {
      const appUser = toAppUser(u)
      if (appUser && !domainOk(appUser.email)) {
        setError(`${allowedDomain} 계정으로만 로그인할 수 있습니다.`)
        setUser(null)
        setLoading(false)
        void supabase!.auth.signOut()
        return
      }
      setUser(appUser)
      setLoading(false)
    }
    // 초기 세션 로드
    supabase.auth.getSession().then(({ data }) => handleSession(data.session?.user))
    // 변경 리스너
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      handleSession(session?.user),
    )
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = async () => {
    if (!supabase) return
    setError(null)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // 도메인 힌트(Workspace 계정 자동 선택)
        queryParams: allowedDomain
          ? { hd: allowedDomain, prompt: 'select_account' }
          : { prompt: 'select_account' },
        redirectTo: window.location.origin,
      },
    })
    if (err) {
      setError('로그인에 실패했습니다. 다시 시도해 주세요.')
    }
    // 성공 시 Google OAuth 페이지로 리디렉트 → 돌아오면 onAuthStateChange 발화
  }

  const logout = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, configured: isSupabaseConfigured, error, signIn, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
