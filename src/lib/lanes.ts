// 서브 태스크 레인 패킹 — 일정이 겹치지 않는 항목끼리 같은 레인(행)에 모아
// 세로 공간을 절약한다. (그리디 인터벌 파티셔닝)
import { parseDate } from './dates'

export interface LaneItem {
  start: string // 'YYYY-MM-DD'
  due: string // 'YYYY-MM-DD'
}

// 각 항목의 레인 인덱스를 "원본 순서" 기준 배열로 반환. laneCount는 max+1.
export function packLanes(items: LaneItem[]): { laneOf: number[]; laneCount: number } {
  const n = items.length
  const laneOf = new Array<number>(n).fill(0)
  if (n === 0) return { laneOf, laneCount: 0 }

  // 시작일 오름차순(동일하면 종료일 오름차순)으로 처리 순서를 정한다.
  const order = items
    .map((it, i) => ({
      i,
      start: parseDate(it.start).getTime(),
      due: parseDate(it.due).getTime(),
    }))
    .sort((a, b) => a.start - b.start || a.due - b.due)

  const laneEnds: number[] = [] // 각 레인이 마지막으로 점유한 due(ms)
  for (const it of order) {
    // start 가 어떤 레인의 마지막 due 보다 뒤(겹치지 않음)면 그 레인에 합류
    let placed = -1
    for (let l = 0; l < laneEnds.length; l++) {
      if (it.start > laneEnds[l]) {
        placed = l
        break
      }
    }
    if (placed === -1) {
      placed = laneEnds.length
      laneEnds.push(it.due)
    } else {
      laneEnds[placed] = it.due
    }
    laneOf[it.i] = placed
  }

  return { laneOf, laneCount: laneEnds.length }
}
