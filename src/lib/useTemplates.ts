import { useCallback, useEffect, useState } from 'react'
import type { ProcessTemplate } from '../types'

const STORAGE_KEY = 'nineware-gantt-templates'

// 처음 사용할 때 채워두는 기본 템플릿 (팀 성격에 맞춘 프로세스)
const DEFAULT_TEMPLATES: ProcessTemplate[] = [
  {
    id: 'tpl-online',
    name: '온라인 마케팅·판매 프로세스',
    team: '영업-마케팅(온라인)',
    steps: [
      { title: '시장·키워드·경쟁사 조사', url: '' },
      { title: '콘텐츠·상세페이지 기획', url: '' },
      { title: '광고 소재 제작', url: '' },
      { title: '채널 세팅 (자사몰·스마트스토어·쿠팡)', url: '' },
      { title: '캠페인 집행', url: '' },
      { title: '성과 분석·리포트', url: '' },
    ],
  },
  {
    id: 'tpl-offline',
    name: '오프라인 영업·유통 프로세스',
    team: '영업-마케팅(오프라인)',
    steps: [
      { title: '거래처·채널 리스트업', url: '' },
      { title: '영업 제안서 작성', url: '' },
      { title: '미팅·상담', url: '' },
      { title: '입점·계약', url: '' },
      { title: '진열·프로모션 실행', url: '' },
      { title: '매출 점검·정산', url: '' },
    ],
  },
  {
    id: 'tpl-product',
    name: '신제품 개발 프로세스',
    team: '디자인연구소(개발)',
    steps: [
      { title: '시장·트렌드 조사', url: '' },
      { title: '컨셉 기획', url: '' },
      { title: '설계·디자인 시안', url: '' },
      { title: '시제품(프로토타입)', url: '' },
      { title: '내부 검증·테스트', url: '' },
      { title: '양산 도면 확정', url: '' },
    ],
  },
  {
    id: 'tpl-manufacture',
    name: '생산·제조 프로세스',
    team: '제조본부',
    steps: [
      { title: '자재 소싱·발주', url: '' },
      { title: '생산 일정 수립', url: '' },
      { title: '초도 생산(샘플)', url: '' },
      { title: '품질 검사(QC)', url: '' },
      { title: '양산', url: '' },
      { title: '출고·재고 반영', url: '' },
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
