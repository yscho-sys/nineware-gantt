import { useEffect, useState } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Task } from '../types'

interface VersionItem {
  id: string
  label: string
  author?: string
  snapshot: Task[]
  count: number
}

interface Props {
  demoMode: boolean
  onRestore: (snapshot: Task[]) => void
  onClose: () => void
}

const DEMO_VERSIONS_KEY = 'nineware-gantt-demo-versions'

export function VersionPanel({ demoMode, onRestore, onClose }: Props) {
  const [items, setItems] = useState<VersionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setError(null)
      if (demoMode) {
        try {
          const raw = JSON.parse(localStorage.getItem(DEMO_VERSIONS_KEY) || '[]') as {
            snapshot: Task[]
            label: string
            at: number
          }[]
          if (alive)
            setItems(
              raw.map((v, i) => ({
                id: String(v.at ?? i),
                label: v.label,
                snapshot: v.snapshot,
                count: v.snapshot?.length ?? 0,
              })),
            )
        } catch {
          if (alive) setItems([])
        }
        setLoading(false)
        return
      }
      const { data, error } = await supabase!
        .from('task_versions')
        .select('id,label,author,snapshot,created_at')
        .order('created_at', { ascending: false })
        .limit(30)
      if (!alive) return
      if (error) {
        setError(error.message)
      } else {
        setItems(
          (data ?? []).map((r) => {
            const row = r as { id: string; label: string; author: string; snapshot: Task[] }
            return {
              id: row.id,
              label: row.label,
              author: row.author,
              snapshot: row.snapshot,
              count: row.snapshot?.length ?? 0,
            }
          }),
        )
      }
      setLoading(false)
    }
    void load()
    return () => {
      alive = false
    }
  }, [demoMode])

  const restore = (v: VersionItem) => {
    if (!confirm(`이 버전(${v.label})으로 되돌릴까요?\n현재 내용이 이 시점 상태로 교체되어 자동 저장·반영됩니다.`))
      return
    onRestore(v.snapshot)
    onClose()
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="drawer-head">
          <h2>버전 기록</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">
          <p className="member-hint">
            편집 중 일정 간격(최대 3분)마다 자동으로 기록됩니다. 되돌리면 그 시점 상태로
            바뀌어 곧바로 자동 저장·반영됩니다. (최근 30개 보관)
          </p>
          {loading ? (
            <div className="side-empty">불러오는 중…</div>
          ) : error ? (
            <div className="member-status err">{error}</div>
          ) : items.length === 0 ? (
            <div className="side-empty">아직 저장된 버전이 없습니다.</div>
          ) : (
            <div className="member-list">
              {items.map((v) => (
                <div key={v.id} className="member-row">
                  <div className="member-main">
                    <span className="member-email">{v.label}</span>
                    <span className="member-fixed-note">
                      {v.count}건{v.author ? ` · ${v.author}` : ''}
                    </span>
                    <button className="icon-btn" onClick={() => restore(v)} title="이 버전으로 되돌리기">
                      <RotateCcw size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="drawer-foot">
          <button className="btn-primary" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
            닫기
          </button>
        </div>
      </div>
    </>
  )
}
