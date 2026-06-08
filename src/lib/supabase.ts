import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// 두 값이 모두 채워져 있을 때만 Supabase 연결을 만든다.
// 비어 있으면 null → 앱은 '데모 모드'(로컬 샘플 데이터)로 동작.
export const isSupabaseConfigured = Boolean(url && anonKey)

// 로그인 허용 도메인(사내 계정만). 비어 있으면 모든 구글 계정 허용.
export const allowedDomain =
  (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN as string | undefined)?.trim() || ''

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null

export const TASKS_TABLE = 'tasks'
