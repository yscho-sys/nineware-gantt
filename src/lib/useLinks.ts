import { useCallback, useEffect, useState } from 'react'
import type { QuickLink } from '../types'
import { SELECTABLE_COLORS } from './palette'

const STORAGE_KEY = 'nineware-gantt-links'
const MIG_KEY = 'nineware-gantt-links-mig' // 기존 저장본 보강 마이그레이션 버전 플래그
const MIG_VERSION = 1

const DEFAULT_LINKS: QuickLink[] = [
  { id: 'lnk-sales', name: '세일즈시스템', url: 'https://sales.nineware.co.kr/', color: '#2f6bff' },
  { id: 'lnk-erp', name: 'ERP (이카운트)', url: 'https://login.ecount.com/Login/', color: '#1fb89a' },
  {
    id: 'lnk-ndc',
    name: 'NDC',
    url: 'https://www.appsheet.com/start/65bad679-d6a5-4661-96ff-7a8b99400400?platform=desktop#appName=NINEWARE_Data_Cluster-321107685&vss=H4sIAAAAAAAAA6WOsQ6CMBRF_-XO_YKuhIEYcZC4WIdKX5NGaAktKmn67xbROBPHd17OvTfibuhxDLK9gZ_j79rRDI4o0MwDCXCBwtkwuk6ACdSyX2F9aKqiFEhIF_a1A3nwuEXm_zQzGEU2GG1oXJIWLyd8rPxenAxWA4mhn4K8dvSemo2UMtOunTypU56xud5XtnwO0qq9UzlQy85TegFlIPe8WwEAAA==&view=NOTICE',
    color: '#8b7ff0',
  },
  { id: 'lnk-mpt', name: 'MPT (마인드맵)', url: 'https://nw-mpt.web.app', color: '#3ad0c0' },
  { id: 'lnk-team', name: '팀업무 대시보드', url: 'https://nw-team.web.app', color: '#5b8def' },
  { id: 'lnk-mall', name: '자사몰', url: 'https://nineware.co.kr/', color: '#f0a23a' },
  { id: 'lnk-smart', name: '스마트스토어', url: 'https://brand.naver.com/nineware', color: '#1fb89a' },
  { id: 'lnk-coupang', name: '쿠팡', url: 'https://www.coupang.com/', color: '#f0502a' },
]

// 이미 저장된 링크 목록을 한 번만 보강(멱등). 사용자가 직접 지운/바꾼 건 다시 건드리지 않도록 1회 실행.
function migrate(list: QuickLink[]): QuickLink[] {
  let next = list.slice()
  // 1) 'MPT' → 'MPT (마인드맵)' 이름 보강
  next = next.map((l) => (l.name.trim() === 'MPT' ? { ...l, name: 'MPT (마인드맵)' } : l))
  // 2) '팀업무 대시보드' 링크가 없으면 추가(MPT 바로 뒤, 없으면 맨 끝)
  if (!next.some((l) => l.url.includes('nw-team.web.app'))) {
    const team: QuickLink = {
      id: 'lnk-team',
      name: '팀업무 대시보드',
      url: 'https://nw-team.web.app',
      color: '#5b8def',
    }
    const idx = next.findIndex((l) => l.url.includes('nw-mpt.web.app'))
    if (idx === -1) next.push(team)
    else next.splice(idx + 1, 0, team)
  }
  return next
}

function load(): QuickLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as QuickLink[]
      if (Array.isArray(arr)) {
        const done = Number(localStorage.getItem(MIG_KEY) || 0)
        if (done < MIG_VERSION) {
          const migrated = migrate(arr)
          localStorage.setItem(MIG_KEY, String(MIG_VERSION))
          save(migrated)
          return migrated
        }
        return arr
      }
    } else {
      // 저장값 없음 = 최초 실행 → 기본값에 이미 반영돼 있으니 플래그만 최신화
      localStorage.setItem(MIG_KEY, String(MIG_VERSION))
    }
  } catch {
    /* 무시 */
  }
  return DEFAULT_LINKS
}

function save(list: QuickLink[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* 무시 */
  }
}

function newId(): string {
  return 'lnk-' + crypto.randomUUID()
}

export interface UseLinksResult {
  links: QuickLink[]
  addLink: (name: string, url: string) => void
  updateLink: (id: string, patch: Partial<Omit<QuickLink, 'id'>>) => void
  removeLink: (id: string) => void
  reorderLinks: (fromIndex: number, toIndex: number) => void
}

export function useLinks(): UseLinksResult {
  const [links, setLinks] = useState<QuickLink[]>([])

  useEffect(() => {
    setLinks(load())
  }, [])

  const addLink = useCallback((name: string, url: string) => {
    const n = name.trim()
    if (!n) return
    setLinks((prev) => {
      const color = SELECTABLE_COLORS[prev.length % SELECTABLE_COLORS.length]
      const next = [...prev, { id: newId(), name: n, url: url.trim(), color }]
      save(next)
      return next
    })
  }, [])

  const updateLink = useCallback((id: string, patch: Partial<Omit<QuickLink, 'id'>>) => {
    setLinks((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
      save(next)
      return next
    })
  }, [])

  const removeLink = useCallback((id: string) => {
    setLinks((prev) => {
      const next = prev.filter((l) => l.id !== id)
      save(next)
      return next
    })
  }, [])

  const reorderLinks = useCallback((fromIndex: number, toIndex: number) => {
    setLinks((prev) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      save(next)
      return next
    })
  }, [])

  return { links, addLink, updateLink, removeLink, reorderLinks }
}
