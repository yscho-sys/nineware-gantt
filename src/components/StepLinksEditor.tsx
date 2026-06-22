import { useState } from 'react'
import { ExternalLink, Trash2, Plus } from 'lucide-react'
import type { StepLink } from '../types'

interface Props {
  links: StepLink[]
  onChange: (links: StepLink[]) => void
  disabled?: boolean
}

function newLinkId(): string {
  return 'lnk-' + crypto.randomUUID()
}
function openUrl(u: string) {
  const v = u.trim()
  if (v) window.open(/^https?:\/\//.test(v) ? v : 'https://' + v, '_blank', 'noopener')
}

// 세부 태스크 문서 링크 여러 개 편집 — 팝업/패널 공용.
export function StepLinksEditor({ links, onChange, disabled }: Props) {
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')

  const update = (id: string, patch: Partial<StepLink>) =>
    onChange(links.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const remove = (id: string) => onChange(links.filter((l) => l.id !== id))
  const add = () => {
    const url = newUrl.trim()
    if (!url) return
    onChange([...links, { id: newLinkId(), label: newLabel.trim() || undefined, url }])
    setNewLabel('')
    setNewUrl('')
  }

  return (
    <div className="lnk-editor">
      {links.map((l) => (
        <div className="lnk-row" key={l.id}>
          <input
            className="lnk-label"
            defaultValue={l.label ?? ''}
            placeholder="이름"
            disabled={disabled}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v !== (l.label ?? '')) update(l.id, { label: v || undefined })
            }}
          />
          <input
            className="lnk-url"
            defaultValue={l.url}
            placeholder="https://docs.google.com/…"
            disabled={disabled}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v !== l.url) update(l.id, { url: v })
            }}
          />
          <button className="lnk-iconbtn" type="button" onClick={() => openUrl(l.url)} title="링크 열기">
            <ExternalLink size={13} />
          </button>
          {!disabled && (
            <button
              className="lnk-iconbtn danger"
              type="button"
              onClick={() => remove(l.id)}
              title="링크 삭제"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <div className="lnk-row add">
          <input
            className="lnk-label"
            value={newLabel}
            placeholder="이름"
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <input
            className="lnk-url"
            value={newUrl}
            placeholder="문서 링크 추가 https://…"
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
          />
          <button className="lnk-iconbtn" type="button" onClick={add} title="링크 추가">
            <Plus size={14} />
          </button>
        </div>
      )}
      {links.length === 0 && disabled && <div className="lnk-empty">링크 없음</div>}
    </div>
  )
}
