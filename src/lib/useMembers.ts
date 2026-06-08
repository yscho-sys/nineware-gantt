import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from './supabase'
import type { AppRole, Member } from '../types'

const MEMBERS_TABLE = 'app_members'
const DEMO_KEY = 'nineware-gantt-demo-members'

const lc = (s: string) => s.trim().toLowerCase()

type MemberRow = {
  email: string
  name: string | null
  role: AppRole
  teams: string[] | null
}

function toMap(rows: MemberRow[]): Record<string, Member> {
  const m: Record<string, Member> = {}
  for (const r of rows) {
    m[lc(r.email)] = {
      email: lc(r.email),
      name: r.name,
      role: r.role,
      teams: r.teams ?? [],
    }
  }
  return m
}

function loadDemo(): Record<string, Member> {
  try {
    const raw = localStorage.getItem(DEMO_KEY)
    if (raw) return JSON.parse(raw) as Record<string, Member>
  } catch {
    /* 무시 */
  }
  return {}
}
function saveDemo(m: Record<string, Member>) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(m))
  } catch {
    /* 무시 */
  }
}

export interface UseMembersResult {
  members: Record<string, Member>
  loading: boolean
  error: string | null
  addMember: (email: string, role: AppRole, teams: string[], name?: string) => Promise<void>
  updateMember: (email: string, patch: Partial<Member>) => Promise<void>
  removeMember: (email: string) => Promise<void>
  reload: () => Promise<void>
}

// 앱 멤버 명부 관리. 실데이터 모드는 Supabase app_members, 데모는 localStorage.
export function useMembers(): UseMembersResult {
  const [members, setMembers] = useState<Record<string, Member>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const demoMode = !isSupabaseConfigured
  const loadedOnce = useRef(false)

  const reload = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true)
    setError(null)
    if (demoMode) {
      setMembers(loadDemo())
      setLoading(false)
      loadedOnce.current = true
      return
    }
    const { data, error } = await supabase!.from(MEMBERS_TABLE).select('*')
    if (error) {
      setError(error.message)
    } else {
      setMembers(toMap((data ?? []) as MemberRow[]))
    }
    setLoading(false)
    loadedOnce.current = true
  }, [demoMode])

  useEffect(() => {
    void reload()
  }, [reload])

  const addMember = useCallback(
    async (email: string, role: AppRole, teams: string[], name?: string) => {
      const e = lc(email)
      if (demoMode) {
        setMembers((prev) => {
          const next = { ...prev, [e]: { email: e, role, teams, name: name ?? null } }
          saveDemo(next)
          return next
        })
        return
      }
      const { error } = await supabase!
        .from(MEMBERS_TABLE)
        .upsert({ email: e, role, teams, name: name ?? null }, { onConflict: 'email' })
      if (error) throw new Error(error.message)
      await reload()
    },
    [demoMode, reload],
  )

  const updateMember = useCallback(
    async (email: string, patch: Partial<Member>) => {
      const e = lc(email)
      if (demoMode) {
        setMembers((prev) => {
          if (!prev[e]) return prev
          const next = { ...prev, [e]: { ...prev[e], ...patch } }
          saveDemo(next)
          return next
        })
        return
      }
      const { error } = await supabase!.from(MEMBERS_TABLE).update(patch).eq('email', e)
      if (error) throw new Error(error.message)
      await reload()
    },
    [demoMode, reload],
  )

  const removeMember = useCallback(
    async (email: string) => {
      const e = lc(email)
      if (demoMode) {
        setMembers((prev) => {
          const next = { ...prev }
          delete next[e]
          saveDemo(next)
          return next
        })
        return
      }
      const { error } = await supabase!.from(MEMBERS_TABLE).delete().eq('email', e)
      if (error) throw new Error(error.message)
      await reload()
    },
    [demoMode, reload],
  )

  return { members, loading, error, addMember, updateMember, removeMember, reload }
}
