import { useCallback, useEffect, useState } from 'react'
import type { QuickLink } from '../types'
import { SELECTABLE_COLORS } from './palette'

const STORAGE_KEY = 'nineware-gantt-links'

const DEFAULT_LINKS: QuickLink[] = [
  { id: 'lnk-sales', name: '세일즈시스템', url: 'https://sales.nineware.co.kr/', color: '#2f6bff' },
  { id: 'lnk-erp', name: 'ERP (이카운트)', url: 'https://login.ecount.com/Login/', color: '#1fb89a' },
  {
    id: 'lnk-ndc',
    name: 'NDC',
    url: 'https://www.appsheet.com/start/65bad679-d6a5-4661-96ff-7a8b99400400?platform=desktop#appName=NINEWARE_Data_Cluster-321107685&vss=H4sIAAAAAAAAA6WOsQ6CMBRF_-XO_YKuhIEYcZC4WIdKX5NGaAktKmn67xbROBPHd17OvTfibuhxDLK9gZ_j79rRDI4o0MwDCXCBwtkwuk6ACdSyX2F9aKqiFEhIF_a1A3nwuEXm_zQzGEU2GG1oXJIWLyd8rPxenAxWA4mhn4K8dvSemo2UMtOunTypU56xud5XtnwO0qq9UzlQy85TegFlIPe8WwEAAA==&view=NOTICE',
    color: '#8b7ff0',
  },
  { id: 'lnk-mpt', name: 'MPT', url: 'https://nw-mpt.web.app', color: '#3ad0c0' },
  { id: 'lnk-mall', name: '자사몰', url: 'https://nineware.co.kr/', color: '#f0a23a' },
  { id: 'lnk-smart', name: '스마트스토어', url: 'https://brand.naver.com/nineware', color: '#1fb89a' },
  { id: 'lnk-coupang', name: '쿠팡', url: 'https://www.coupang.com/', color: '#f0502a' },
]

function load(): QuickLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as QuickLink[]
      if (Array.isArray(arr)) return arr
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
