import { useState } from 'react'
import { X, Plus, Trash2, Check, Pencil } from 'lucide-react'
import { SELECTABLE_COLORS } from '../lib/palette'

interface Props {
  teams: string[]
  taskCounts: Record<string, number>
  colorOf: (team: string) => string
  onAdd: (name: string) => void
  onRename: (oldName: string, newName: string) => void
  onRemove: (name: string) => void
  onSetColor: (team: string, color: string) => void
  onClose: () => void
}

export function TeamManager({
  teams,
  taskCounts,
  colorOf,
  onAdd,
  onRename,
  onRemove,
  onSetColor,
  onClose,
}: Props) {
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [colorOpen, setColorOpen] = useState<string | null>(null)

  function startEdit(team: string) {
    setEditing(team)
    setEditValue(team)
  }
  function commitEdit() {
    if (editing && editValue.trim()) onRename(editing, editValue.trim())
    setEditing(null)
  }
  function handleRemove(team: string) {
    const count = taskCounts[team] ?? 0
    const msg =
      count > 0
        ? `'${team}' 팀에 테스크 ${count}건이 있습니다. 팀 목록에서만 제거하며 테스크는 남습니다. 계속할까요?`
        : `'${team}' 팀을 삭제할까요?`
    if (confirm(msg)) onRemove(team)
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="drawer-head">
          <h2>팀 관리</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        <div className="drawer-body">
          <div className="add-team-row">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="새 팀 이름"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  onAdd(newName.trim())
                  setNewName('')
                }
              }}
            />
            <button
              className="btn-primary"
              onClick={() => {
                if (newName.trim()) {
                  onAdd(newName.trim())
                  setNewName('')
                }
              }}
            >
              <Plus size={16} /> 추가
            </button>
          </div>

          <div className="team-list">
            {teams.map((team) => (
              <div className="team-row-wrap" key={team}>
                <div className="team-row">
                  <button
                    className="team-color-btn"
                    style={{ background: colorOf(team) }}
                    onClick={() => setColorOpen(colorOpen === team ? null : team)}
                    title="색상 변경"
                  />
                  {editing === team ? (
                    <input
                      className="team-edit-input"
                      value={editValue}
                      autoFocus
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit()
                        if (e.key === 'Escape') setEditing(null)
                      }}
                    />
                  ) : (
                    <span className="team-row-name">{team}</span>
                  )}
                  <span className="team-row-count">{taskCounts[team] ?? 0}건</span>
                  {editing === team ? (
                    <button className="icon-btn" onClick={commitEdit} title="저장">
                      <Check size={16} />
                    </button>
                  ) : (
                    <button className="icon-btn" onClick={() => startEdit(team)} title="이름 수정">
                      <Pencil size={15} />
                    </button>
                  )}
                  <button className="icon-btn danger" onClick={() => handleRemove(team)} title="삭제">
                    <Trash2 size={15} />
                  </button>
                </div>
                {colorOpen === team && (
                  <div className="swatches">
                    {SELECTABLE_COLORS.map((c) => (
                      <button
                        key={c}
                        className={'swatch' + (colorOf(team) === c ? ' active' : '')}
                        style={{ background: c }}
                        onClick={() => {
                          onSetColor(team, c)
                          setColorOpen(null)
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {teams.length === 0 && (
              <div className="side-empty">팀이 없습니다. 위에서 추가하세요.</div>
            )}
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
