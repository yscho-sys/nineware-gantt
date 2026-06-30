import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured, TASKS_TABLE } from './supabase'
import { SAMPLE_TASKS } from './sampleData'
import type { Task, TaskDraft } from '../types'

const DEMO_STORAGE_KEY = 'nineware-gantt-demo-tasks-v3' // 데모 모드 저장 상태
const DEMO_VERSIONS_KEY = 'nineware-gantt-demo-versions'
const VERSIONS_TABLE = 'task_versions'
const MAX_HISTORY = 50 // undo/redo 단계 상한
const MAX_VERSIONS = 30 // 버전 스냅샷 보관 상한(무료 용량 절약)
const SAVE_DEBOUNCE_MS = 800 // 편집이 멈춘 뒤 이만큼 지나면 DB에 일괄 반영(연속 편집 묶기)
const VERSION_MIN_INTERVAL_MS = 3 * 60 * 1000 // 버전 스냅샷 최소 간격 — 자동저장마다 쌓지 않고 주기 제한

function newId(): string {
  return crypto.randomUUID()
}

// ── 데모(localStorage) 입출력 ──
function loadDemoTasks(): Task[] {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Task[]
  } catch {
    /* 무시 */
  }
  return SAMPLE_TASKS
}
function saveDemoTasks(tasks: Task[]) {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(tasks))
  } catch {
    /* 무시 */
  }
}

// upsert 용 행 변환 (id 포함, 타임스탬프는 서버가 관리)
function toRow(t: Task) {
  const { created_at: _c, updated_at: _u, ...rest } = t
  return rest
}

// 저장 대상 컬럼 기준 동일성 비교(타임스탬프 제외)
function rowEqual(a: Task, b: Task): boolean {
  return JSON.stringify(toRow(a)) === JSON.stringify(toRow(b))
}

// 배열에 행을 끼워넣기/교체(id 기준)
function upsertInto(arr: Task[], row: Task): Task[] {
  const i = arr.findIndex((t) => t.id === row.id)
  if (i === -1) return [...arr, row]
  const next = arr.slice()
  next[i] = row
  return next
}

// 로컬(작업본) vs 마지막 저장본의 차이 — 변경/추가/삭제된 id 집합
function diffPending(working: Task[], saved: Task[]): Set<string> {
  const ids = new Set<string>()
  for (const w of working) {
    const s = saved.find((x) => x.id === w.id)
    if (!s || !rowEqual(s, w)) ids.add(w.id)
  }
  for (const s of saved) {
    if (!working.some((w) => w.id === s.id)) ids.add(s.id)
  }
  return ids
}

export interface UseTasksResult {
  tasks: Task[]
  loading: boolean
  error: string | null
  demoMode: boolean
  saving: boolean // 자동저장(DB 반영) 진행 중 — 상태표시용
  savedAt: number | null // 마지막으로 저장된 시각(ms)
  canUndo: boolean
  canRedo: boolean
  addTask: (draft: TaskDraft) => Promise<void>
  editTask: (id: string, draft: TaskDraft) => Promise<void>
  removeTask: (id: string) => Promise<void>
  renameTeamInTasks: (oldName: string, newName: string) => Promise<void>
  replaceTasks: (next: Task[]) => void // 일괄 변경(예: 순서 재배치/버전 복원) — undo 1단계
  undo: () => void
  redo: () => void
  reload: () => Promise<void>
}

export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]) // 화면에 보이는 상태(편집 즉시 반영)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [past, setPast] = useState<Task[][]>([])
  const [future, setFuture] = useState<Task[][]>([])

  const demoMode = !isSupabaseConfigured
  const loadedOnce = useRef(false)

  // 최신 값 참조용 ref (setState 업데이터 안에서 또 setState 호출하는 패턴을 피해
  // StrictMode 이중 호출로 히스토리가 두 번 쌓이는 문제를 방지)
  const tasksRef = useRef<Task[]>([])
  const pastRef = useRef<Task[][]>([])
  const futureRef = useRef<Task[][]>([])
  const savedRef = useRef<Task[]>([]) // 마지막으로 DB/로컬에 반영된 상태(차이 계산·실시간 병합 기준)
  const pendingIdsRef = useRef<Set<string>>(new Set()) // 아직 저장 안 된 로컬 변경 id(실시간 에코/충돌 보호)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastVersionAt = useRef<number>(0) // 마지막 버전 스냅샷 시각(주기 제한)

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])
  useEffect(() => {
    pastRef.current = past
  }, [past])
  useEffect(() => {
    futureRef.current = future
  }, [future])

  const reload = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true)
    setError(null)
    let next: Task[] = []
    if (demoMode) {
      next = loadDemoTasks()
    } else {
      const { data, error } = await supabase!
        .from(TASKS_TABLE)
        .select('*')
        .order('team', { ascending: true })
        .order('sort_order', { ascending: true })
      if (error) {
        setError(error.message)
        setLoading(false)
        loadedOnce.current = true
        return
      }
      next = (data ?? []) as Task[]
    }
    savedRef.current = next
    pendingIdsRef.current = new Set()
    setTasks(next)
    setPast([])
    setFuture([])
    setLoading(false)
    loadedOnce.current = true
  }, [demoMode])

  useEffect(() => {
    void reload()
  }, [reload])

  // ── 버전 스냅샷(주기 제한) ──
  const maybeSnapshot = useCallback(
    async (snap: Task[]) => {
      const now = Date.now()
      if (now - lastVersionAt.current < VERSION_MIN_INTERVAL_MS) return
      lastVersionAt.current = now
      const label = new Date().toLocaleString('ko-KR')
      if (demoMode) {
        try {
          const list = JSON.parse(localStorage.getItem(DEMO_VERSIONS_KEY) || '[]') as unknown[]
          list.unshift({ snapshot: snap, label, at: now })
          localStorage.setItem(DEMO_VERSIONS_KEY, JSON.stringify(list.slice(0, MAX_VERSIONS)))
        } catch {
          /* 무시 */
        }
        return
      }
      let author = ''
      try {
        const { data } = await supabase!.auth.getUser()
        author = data.user?.email ?? ''
      } catch {
        /* 무시 */
      }
      await supabase!.from(VERSIONS_TABLE).insert({ snapshot: snap, label, author })
      // 보관 상한 초과분 정리(최근 MAX_VERSIONS만 유지)
      const { data: old } = await supabase!
        .from(VERSIONS_TABLE)
        .select('id')
        .order('created_at', { ascending: false })
        .range(MAX_VERSIONS, MAX_VERSIONS + 200)
      if (old && old.length) {
        await supabase!
          .from(VERSIONS_TABLE)
          .delete()
          .in('id', (old as { id: string }[]).map((r) => r.id))
      }
    },
    [demoMode],
  )

  // ── 변경분 DB 반영(자동저장) — 여기서만 쓰기 발생. 변경된 행만 upsert, 삭제된 행만 delete. ──
  const flush = useCallback(async () => {
    const working = tasksRef.current
    const saved = savedRef.current
    const changed = working.filter((w) => {
      const s = saved.find((x) => x.id === w.id)
      return !s || !rowEqual(s, w)
    })
    const removedIds = saved.filter((s) => !working.some((w) => w.id === s.id)).map((s) => s.id)
    if (!changed.length && !removedIds.length) return

    setSaving(true)
    setError(null)
    try {
      if (demoMode) {
        saveDemoTasks(working)
      } else {
        if (removedIds.length) {
          const { error } = await supabase!.from(TASKS_TABLE).delete().in('id', removedIds)
          if (error) throw new Error(error.message)
        }
        if (changed.length) {
          const { error } = await supabase!.from(TASKS_TABLE).upsert(changed.map(toRow))
          if (error) throw new Error(error.message)
        }
      }
      savedRef.current = working // 방금 반영한 스냅샷을 기준으로
      setSavedAt(Date.now())
      void maybeSnapshot(working)
      // 저장 도중 들어온 추가 편집이 있으면 다시 예약
      pendingIdsRef.current = diffPending(tasksRef.current, savedRef.current)
      if (pendingIdsRef.current.size) scheduleFlush()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, maybeSnapshot])

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null
      void flush()
    }, SAVE_DEBOUNCE_MS)
  }, [flush])

  // 편집 적용 공통 — 화면 즉시 반영 + 히스토리 적재 + 자동저장 예약
  const apply = useCallback(
    (next: Task[]) => {
      const prev = tasksRef.current
      setPast((p) => [...p.slice(-MAX_HISTORY + 1), prev])
      setFuture([])
      setTasks(next)
      pendingIdsRef.current = diffPending(next, savedRef.current)
      scheduleFlush()
    },
    [scheduleFlush],
  )

  const addTask = useCallback(
    async (draft: TaskDraft) => {
      apply([...tasksRef.current, { ...draft, id: newId() } as Task])
    },
    [apply],
  )

  const editTask = useCallback(
    async (id: string, draft: TaskDraft) => {
      apply(tasksRef.current.map((t) => (t.id === id ? ({ ...t, ...draft, id } as Task) : t)))
    },
    [apply],
  )

  const removeTask = useCallback(
    async (id: string) => {
      apply(tasksRef.current.filter((t) => t.id !== id))
    },
    [apply],
  )

  const renameTeamInTasks = useCallback(
    async (oldName: string, newName: string) => {
      apply(tasksRef.current.map((t) => (t.team === oldName ? { ...t, team: newName } : t)))
    },
    [apply],
  )

  const replaceTasks = useCallback((next: Task[]) => apply(next), [apply])

  const undo = useCallback(() => {
    const p = pastRef.current
    if (p.length === 0) return
    const prevState = p[p.length - 1]
    setFuture((f) => [tasksRef.current, ...f])
    setPast(p.slice(0, -1))
    setTasks(prevState)
    pendingIdsRef.current = diffPending(prevState, savedRef.current)
    scheduleFlush()
  }, [scheduleFlush])

  const redo = useCallback(() => {
    const f = futureRef.current
    if (f.length === 0) return
    const nextState = f[0]
    setPast((p) => [...p, tasksRef.current])
    setFuture(f.slice(1))
    setTasks(nextState)
    pendingIdsRef.current = diffPending(nextState, savedRef.current)
    scheduleFlush()
  }, [scheduleFlush])

  // ── 실시간 구독: 다른 사용자(또는 다른 탭)의 변경을 화면에 자동 반영 ──
  //  행 단위 last-write-wins. 내가 아직 저장 안 한 행(pending)은 보호(덮어쓰지 않음).
  useEffect(() => {
    if (demoMode || !supabase) return
    const client = supabase
    const ch = client
      .channel('tasks-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TASKS_TABLE },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string } | null)?.id
            if (!id || pendingIdsRef.current.has(id)) return
            setTasks((prev) => prev.filter((t) => t.id !== id))
            savedRef.current = savedRef.current.filter((t) => t.id !== id)
            return
          }
          const row = payload.new as Task
          if (!row?.id || pendingIdsRef.current.has(row.id)) return
          // 동일/구버전 에코는 무시(saved만 최신화) — 더 최신일 때만 화면 반영
          const cur = tasksRef.current.find((t) => t.id === row.id)
          if (cur?.updated_at && row.updated_at && row.updated_at <= cur.updated_at) {
            savedRef.current = upsertInto(savedRef.current, row)
            return
          }
          setTasks((prev) => upsertInto(prev, row))
          savedRef.current = upsertInto(savedRef.current, row)
        },
      )
      .subscribe()
    return () => {
      void client.removeChannel(ch)
    }
  }, [demoMode])

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current)
    }
  }, [])

  return {
    tasks,
    loading,
    error,
    demoMode,
    saving,
    savedAt,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    addTask,
    editTask,
    removeTask,
    renameTeamInTasks,
    replaceTasks,
    undo,
    redo,
    reload,
  }
}
