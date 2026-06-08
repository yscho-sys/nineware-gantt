import { createContext, useContext, type ReactNode } from 'react'
import type { AppRole, Task } from '../types'

// 화면 게이팅용 권한 컨텍스트. 컴포넌트 깊은 곳까지 prop 을 넘기지 않도록 제공.
export interface PermitValue {
  role: AppRole
  canCreate: boolean
  canEdit: (task: Pick<Task, 'team' | 'owner_email'>) => boolean
}

// 기본값: 전체 허용(데모/미설정 환경에서 막히지 않도록).
const PermitContext = createContext<PermitValue>({
  role: 'admin',
  canCreate: true,
  canEdit: () => true,
})

export function PermitProvider({
  value,
  children,
}: {
  value: PermitValue
  children: ReactNode
}) {
  return <PermitContext.Provider value={value}>{children}</PermitContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const usePermit = () => useContext(PermitContext)
