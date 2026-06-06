import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_TEAMS } from '../types'
import { teamColor } from './palette'

const TEAMS_STORAGE_KEY = 'nineware-gantt-teams'
const COLORS_STORAGE_KEY = 'nineware-gantt-team-colors'

function loadTeams(): string[] {
  try {
    const raw = localStorage.getItem(TEAMS_STORAGE_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as string[]
      if (Array.isArray(arr) && arr.length) return arr
    }
  } catch {
    /* 무시 */
  }
  return DEFAULT_TEAMS
}

function loadColors(): Record<string, string> {
  try {
    const raw = localStorage.getItem(COLORS_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Record<string, string>
  } catch {
    /* 무시 */
  }
  return {}
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 무시 */
  }
}

export interface UseTeamsResult {
  teams: string[]
  colorOf: (team: string) => string
  addTeam: (name: string) => void
  renameTeam: (oldName: string, newName: string) => void
  removeTeam: (name: string) => void
  setTeamColor: (team: string, color: string) => void
}

// 팀 목록 + 팀별 색을 localStorage 로 관리 (데모/실데이터 모드 공통).
// onRename: 팀 이름이 바뀌면 해당 팀의 기존 태스크들도 따라 갱신하도록 콜백 호출.
export function useTeams(onRename?: (oldName: string, newName: string) => void): UseTeamsResult {
  const [teams, setTeams] = useState<string[]>([])
  const [colors, setColors] = useState<Record<string, string>>({})

  useEffect(() => {
    setTeams(loadTeams())
    setColors(loadColors())
  }, [])

  // 지정 색이 있으면 그 색, 없으면 목록 순서 기반 기본 팔레트
  const colorOf = useCallback(
    (team: string) => {
      if (colors[team]) return colors[team]
      const idx = teams.indexOf(team)
      return teamColor(idx >= 0 ? idx : teams.length + team.length)
    },
    [colors, teams],
  )

  const addTeam = useCallback((name: string) => {
    const n = name.trim()
    if (!n) return
    setTeams((prev) => {
      if (prev.includes(n)) return prev
      const next = [...prev, n]
      save(TEAMS_STORAGE_KEY, next)
      return next
    })
  }, [])

  const renameTeam = useCallback(
    (oldName: string, newName: string) => {
      const n = newName.trim()
      if (!n || n === oldName) return
      setTeams((prev) => {
        const next = prev.map((t) => (t === oldName ? n : t))
        save(TEAMS_STORAGE_KEY, next)
        return next
      })
      setColors((prev) => {
        if (!prev[oldName]) return prev
        const next = { ...prev, [n]: prev[oldName] }
        delete next[oldName]
        save(COLORS_STORAGE_KEY, next)
        return next
      })
      onRename?.(oldName, n)
    },
    [onRename],
  )

  const removeTeam = useCallback((name: string) => {
    setTeams((prev) => {
      const next = prev.filter((t) => t !== name)
      save(TEAMS_STORAGE_KEY, next)
      return next
    })
    setColors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      save(COLORS_STORAGE_KEY, next)
      return next
    })
  }, [])

  const setTeamColor = useCallback((team: string, color: string) => {
    setColors((prev) => {
      const next = { ...prev, [team]: color }
      save(COLORS_STORAGE_KEY, next)
      return next
    })
  }, [])

  return { teams, colorOf, addTeam, renameTeam, removeTeam, setTeamColor }
}
