import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured, TASKS_TABLE } from './supabase'
import { SAMPLE_TASKS } from './sampleData'
import type { Task, TaskDraft } from '../types'

const DEMO_STORAGE_KEY = 'nineware-gantt-demo-tasks-v3' // 데모 모드 '저장된' 상태
const BACKUP_KEY = 'nineware-gantt-draft-backup' // 미저장 작업본 백업(이탈/새로고침 대비)
const VERSIONS_TABLE = 'task_versions'
const MAX_HISTORY = 50 // undo/redo 단계 상한
const MAX_VERSIONS = 30 // 버전 스냅샷 보관 상한(무료 용량 절약)

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

// ── 미저장 작업본 백업 ──
interface Backup {
  tasks: Task[]
  at: number
}
function writeBackup(tasks: Task[]) {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ tasks, at: Date.now() } as Backup))
  } catch {
    /* 무시 */
  }
}
function readBackup(): Backup | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY)
    if (raw) return JSON.parse(raw) as Backup
  } catch {
    /* 무시 */
  }
  return null
}
function clearBackup() {
  try {
    localStorage.removeItem(BACKUP_KEY)
  } catch {
    /* 무시 */
  }
}

// upsert 용 행 변환 (id 포함, 타임스탬프는 서버가 관리)
function toRow(t: Task) {
  const { created_at: _c, updated_at: _u, ...rest } = t
  return rest
}

export interface UseTasksResult {
  tasks: Task[]
  loading: boolean
  error: string | null
  demoMode: boolean
  dirty: boolean
  saving: boolean
  canUndo: boolean
  canRedo: boolean
  recoverable: Backup | null
  addTask: (draft: TaskDraft) => Promise<void>
  editTask: (id: string, draft: TaskDraft) => Promise<void>
  removeTask: (id: string) => Promise<void>
  renameTeamInTasks: (oldName: string, newName: string) => Promise<void>
  replaceTasks: (next: Task[]) => void // 일괄 변경(예: 순서 재배치) — undo 1단계
  save: () => Promise<void>
  undo: () => void
  redo: () => void
  recover: () => void
  discardBackup: () => void
  reload: () => Promise<void>
}

export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]) // 작업본(화면에 보이는 편집 중 상태)
  const [saved, setSaved] = useState<Task[]>([]) // 마지막으로 DB/로컬에 저장된 상태
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [past, setPast] = useState<Task[][]>([])
  const [future, setFuture] = useState<Task[][]>([])
  const [recoverable, setRecoverable] = useState<Backup | null>(null)

  const demoMode = !isSupabaseConfigured
  const loadedOnce = useRef(false)

  // 최신 값 참조용 ref (setState 업데이터 안에서 또 setState 호출하는 패턴을 피해
  // StrictMode 이중 호출로 히스토리가 두 번 쌓이는 문제를 방지)
  const tasksRef = useRef<Task[]>([])
  const pastRef = useRef<Task[][]>([])
  const futureRef = useRef<Task[][]>([])
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
    setSaved(next)
    setTasks(next)
    setPast([])
    setFuture([])
    setDirty(false)
    setLoading(false)
    // 첫 로드 시 미저장 백업이 있으면 복구 후보로 노출
    if (!loadedOnce.current) {
      const b = readBackup()
      if (b && b.tasks?.length) setRecoverable(b)
    }
    loadedOnce.current = true
  }, [demoMode])

  useEffect(() => {
    void reload()
  }, [reload])

  // 작업본 갱신 공통 — 직전 상태를 히스토리에 적재, 로컬 백업 기록. DB 쓰기 없음.
  const apply = useCallback((next: Task[]) => {
    const prev = tasksRef.current
    setPast((p) => [...p.slice(-MAX_HISTORY + 1), prev])
    setFuture([])
    setTasks(next)
    setDirty(true)
    writeBackup(next)
  }, [])

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
    setDirty(true)
    writeBackup(prevState)
  }, [])

  const redo = useCallback(() => {
    const f = futureRef.current
    if (f.length === 0) return
    const nextState = f[0]
    setPast((p) => [...p, tasksRef.current])
    setFuture(f.slice(1))
    setTasks(nextState)
    setDirty(true)
    writeBackup(nextState)
  }, [])

  // DB(또는 로컬)에 일괄 저장 + 버전 스냅샷 1건. 여기서만 DB 쓰기 발생.
  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    const working = tasks
    try {
      if (demoMode) {
        saveDemoTasks(working)
        // 데모 버전은 로컬에 간단 보관
        try {
          const key = 'nineware-gantt-demo-versions'
          const list = JSON.parse(localStorage.getItem(key) || '[]') as unknown[]
          list.unshift({ snapshot: working, label: new Date().toLocaleString('ko-KR'), at: Date.now() })
          localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_VERSIONS)))
        } catch {
          /* 무시 */
        }
      } else {
        const removedIds = saved.filter((s) => !working.some((w) => w.id === s.id)).map((s) => s.id)
        if (removedIds.length) {
          const { error } = await supabase!.from(TASKS_TABLE).delete().in('id', removedIds)
          if (error) throw new Error(error.message)
        }
        if (working.length) {
          const { error } = await supabase!.from(TASKS_TABLE).upsert(working.map(toRow))
          if (error) throw new Error(error.message)
        }
        // 버전 스냅샷 1건 + 오래된 버전 정리
        let author = ''
        try {
          const { data } = await supabase!.auth.getUser()
          author = data.user?.email ?? ''
        } catch {
          /* 무시 */
        }
        await supabase!.from(VERSIONS_TABLE).insert({
          snapshot: working,
          label: new Date().toLocaleString('ko-KR'),
          author,
        })
        // 보관 상한 초과분 삭제(최근 MAX_VERSIONS만 유지)
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
      }
      setSaved(working)
      setDirty(false)
      clearBackup()
      setRecoverable(null)
    } catch (e) {
      setError((e as Error).message)
      throw e
    } finally {
      setSaving(false)
    }
  }, [demoMode, tasks, saved])

  const recover = useCallback(() => {
    if (!recoverable) return
    apply(recoverable.tasks)
    setRecoverable(null)
  }, [recoverable, apply])

  const discardBackup = useCallback(() => {
    clearBackup()
    setRecoverable(null)
  }, [])

  return {
    tasks,
    loading,
    error,
    demoMode,
    dirty,
    saving,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    recoverable,
    addTask,
    editTask,
    removeTask,
    renameTeamInTasks,
    replaceTasks,
    save,
    undo,
    redo,
    recover,
    discardBackup,
    reload,
  }
}
