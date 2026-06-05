import { useEffect } from 'react'
import { Plus } from 'lucide-react'

interface Props {
  x: number
  y: number
  label: string // 예: "영업-마케팅(온라인) · 6/12"
  onCreate: () => void
  onClose: () => void
}

// 빈 영역 우클릭 메뉴 — 해당 위치에 새 태스크 만들기
export function EmptyMenu({ x, y, label, onCreate, onClose }: Props) {
  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 220)
  const top = Math.min(y, window.innerHeight - 90)

  return (
    <div className="context-menu" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
      <div className="ctx-title">{label}</div>
      <button className="ctx-item" onClick={onCreate}>
        <Plus size={14} /> 여기에 새 태스크
      </button>
    </div>
  )
}
