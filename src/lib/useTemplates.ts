import { useCallback, useEffect, useState } from 'react'
import type { ProcessTemplate } from '../types'

const STORAGE_KEY = 'nineware-gantt-templates'

// 처음 사용할 때 채워두는 기본 템플릿 (팀별 프로세스 예시)
const DEFAULT_TEMPLATES: ProcessTemplate[] = [
  {
    id: 'tpl-product',
    name: '신제품 개발 프로세스',
    team: '디자인연구소(개발)',
    steps: [
      { title: '시장·트렌드 조사', url: '' },
      { title: '컨셉 기획', url: '' },
      { title: '설계·시안', url: '' },
      { title: '시제품(프로토타입)', url: '' },
      { title: '내부 검증·테스트', url: '' },
      { title: '양산 도면 확정', url: '' },
    ],
  },
  {
    id: 'tpl-campaign',
    name: '마케팅 캠페인 프로세스',
    team: '영업-마케팅(온라인)',
    steps: [
      { title: '시장·경쟁사 조사', url: '' },
      { title: '캠페인 컨셉 기획', url: '' },
      { title: '콘텐츠 제작', url: '' },
      { title: '채널 집행', url: '' },
      { title: '성과 분석 리포트', url: '' },
    ],
  },
]

function load(): ProcessTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ProcessTemplate[]
  } catch {
    /* 무시 */
  }
  return DEFAULT_TEMPLATES
}

function save(list: ProcessTemplate[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* 무시 */
  }
}

function newId(): string {
  return 'tpl-' + crypto.randomUUID()
}

export interface UseTemplatesResult {
  templates: ProcessTemplate[]
  addTemplate: (name: string, team: string, steps: { title: string; url: string }[]) => void
  removeTemplate: (id: string) => void
}

export function useTemplates(): UseTemplatesResult {
  const [templates, setTemplates] = useState<ProcessTemplate[]>([])

  useEffect(() => {
    setTemplates(load())
  }, [])

  const addTemplate = useCallback(
    (name: string, team: string, steps: { title: string; url: string }[]) => {
      const n = name.trim()
      if (!n || steps.length === 0) return
      setTemplates((prev) => {
        const next = [...prev, { id: newId(), name: n, team, steps }]
        save(next)
        return next
      })
    },
    [],
  )

  const removeTemplate = useCallback((id: string) => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id)
      save(next)
      return next
    })
  }, [])

  return { templates, addTemplate, removeTemplate }
}
