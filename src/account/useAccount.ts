import { useContext } from 'react'
import { AccountContext } from './AccountContext.ts'

export function useAccount() {
  const context = useContext(AccountContext)
  if (!context) throw new Error('useAccount requires AccountProvider')
  return context
}
