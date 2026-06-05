import { useState } from 'react'
import { X, Plus, Trash2, GripVertical } from 'lucide-react'
import type { QuickLink } from '../types'
import { SELECTABLE_COLORS } from '../lib/palette'

interface Props {
  links: QuickLink[]
  onAdd: (name: string, url: string) => void
  onUpdate: (id: string, patch: Partial<Omit<QuickLink, 'id'>>) => void
  onRemove: (id: string) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onClose: () => void
}

// 바로가기 링크 관리 — 추가/수정/삭제 + 드래그로 순서 변경
export function LinkManager({ links, onAdd, onUpdate, onRemove, onReorder, onClose }: Props) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [colorOpen, setColorOpen] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function submit() {
    if (!name.trim()) return
    onAdd(name.trim(), url.trim())
    setName('')
    setUrl('')
  }

  function handleDrop(toIndex: number) {
    if (dragIndex !== null) onReorder(dragIndex, toIndex)
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="drawer-head">
          <h2>바로가기 관리</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        <div className="drawer-body">
          <div className="add-link-rows">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름 (예: 세일즈시스템)"
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />
            <div className="add-team-row">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                }}
              />
              <button className="btn-primary" onClick={submit}>
                <Plus size={16} /> 추가
              </button>
            </div>
          </div>

          <div className="hint-text">행을 드래그하면 순서를 바꿀 수 있습니다.</div>

          <div className="team-list">
            {links.map((l, i) => (
              <div
                className={
                  'link-row' +
                  (dragIndex === i ? ' dragging' : '') +
                  (overIndex === i && dragIndex !== i ? ' drop-target' : '')
                }
                key={l.id}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOverIndex(i)
                }}
                onDrop={() => handleDrop(i)}
                onDragEnd={() => {
                  setDragIndex(null)
                  setOverIndex(null)
                }}
              >
                <span className="drag-handle" title="드래그로 순서 변경">
                  <GripVertical size={15} />
                </span>
                <button
                  className="team-color-btn"
                  style={{ background: l.color }}
                  onClick={() => setColorOpen(colorOpen === l.id ? null : l.id)}
                  title="색상 변경"
                />
                <div className="link-fields">
                  <input
                    className="link-name-input"
                    value={l.name}
                    onChange={(e) => onUpdate(l.id, { name: e.target.value })}
                    placeholder="이름"
                  />
                  <input
                    className="link-url-input"
                    value={l.url}
                    onChange={(e) => onUpdate(l.id, { url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <button className="icon-btn danger" onClick={() => onRemove(l.id)} title="삭제">
                  <Trash2 size={15} />
                </button>
                {colorOpen === l.id && (
                  <div className="swatches link-swatches">
                    {SELECTABLE_COLORS.map((c) => (
                      <button
                        key={c}
                        className={'swatch' + (l.color === c ? ' active' : '')}
                        style={{ background: c }}
                        onClick={() => {
                          onUpdate(l.id, { color: c })
                          setColorOpen(null)
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {links.length === 0 && <div className="side-empty">링크가 없습니다. 위에서 추가하세요.</div>}
          </div>
        </div>

        <div className="drawer-foot">
          <button
            className="btn-primary"
            onClick={onClose}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            완료
          </button>
        </div>
      </div>
    </>
  )
}
