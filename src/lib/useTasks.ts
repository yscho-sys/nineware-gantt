import { useCallback, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured, TASKS_TABLE } from './supabase'
import { SAMPLE_TASKS } from './sampleData'
import type { Task, TaskDraft } from '../types'

const DEMO_STORAGE_KEY = 'nineware-gantt-demo-tasks-v3'

// 데모 모드: localStorage 에서 읽고, 없으면 샘플로 시작
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

// 데모 모드용 간단한 id 생성 (crypto.randomUUID 는 Math.random 미사용)
function demoId(): string {
  return 'demo-' + crypto.randomUUID()
}

export interface UseTasksResult {
  tasks: Task[]
  loading: boolean
  error: string | null
  demoMode: boolean
  addTask: (draft: TaskDraft) => Promise<void>
  editTask: (id: string, draft: TaskDraft) => Promise<void>
  removeTask: (id: string) => Promise<void>
  renameTeamInTasks: (oldName: string, newName: string) => Promise<void>
  reload: () => Promise<void>
}

export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const demoMode = !isSupabaseConfigured

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    if (demoMode) {
      setTasks(loadDemoTasks())
      setLoading(false)
      return
    }
    const { data, error } = await supabase!
      .from(TASKS_TABLE)
      .select('*')
      .order('team', { ascending: true })
      .order('sort_order', { ascending: true })
    if (error) {
      setError(error.message)
      setTasks([])
    } else {
      setTasks((data ?? []) as Task[])
    }
    setLoading(false)
  }, [demoMode])

  useEffect(() => {
    void reload()
  }, [reload])

  const addTask = useCallback(
    async (draft: TaskDraft) => {
      if (demoMode) {
        setTasks((prev) => {
          const next = [...prev, { ...draft, id: demoId() }]
          saveDemoTasks(next)
          return next
        })
        return
      }
      const { error } = await supabase!.from(TASKS_TABLE).insert(draft)
      if (error) throw new Error(error.message)
      await reload()
    },
    [demoMode, reload],
  )

  const editTask = useCallback(
    async (id: string, draft: TaskDraft) => {
      if (demoMode) {
        setTasks((prev) => {
          const next = prev.map((t) => (t.id === id ? { ...t, ...draft, id } : t))
          saveDemoTasks(next)
          return next
        })
        return
      }
      const { error } = await supabase!.from(TASKS_TABLE).update(draft).eq('id', id)
      if (error) throw new Error(error.message)
      await reload()
    },
    [demoMode, reload],
  )

  const removeTask = useCallback(
    async (id: string) => {
      if (demoMode) {
        setTasks((prev) => {
          const next = prev.filter((t) => t.id !== id)
          saveDemoTasks(next)
          return next
        })
        return
      }
      const { error } = await supabase!.from(TASKS_TABLE).delete().eq('id', id)
      if (error) throw new Error(error.message)
      await reload()
    },
    [demoMode, reload],
  )

  const renameTeamInTasks = useCallback(
    async (oldName: string, newName: string) => {
      if (demoMode) {
        setTasks((prev) => {
          const next = prev.map((t) => (t.team === oldName ? { ...t, team: newName } : t))
          saveDemoTasks(next)
          return next
        })
        return
      }
      const { error } = await supabase!
        .from(TASKS_TABLE)
        .update({ team: newName })
        .eq('team', oldName)
      if (error) throw new Error(error.message)
      await reload()
    },
    [demoMode, reload],
  )

  return {
    tasks,
    loading,
    error,
    demoMode,
    addTask,
    editTask,
    removeTask,
    renameTeamInTasks,
    reload,
  }
}
