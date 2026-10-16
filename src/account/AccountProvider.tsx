import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getAccountSubscription, getAccountUsage } from '../api/account.ts'
import type { AccountSubscriptionResponse, AccountUsageResponse } from '../api/contracts/account.ts'
import { useAuth } from '../auth/useAuth.ts'
import { AccountContext, type AccountResource } from './AccountContext.ts'

const initial = <T,>(): AccountResource<T> => ({ data: null, loading: true, failed: false })
const REQUEST_TIMEOUT_MS = 10_000
const FOCUS_REFRESH_INTERVAL_MS = 30_000

/** Mounted inside the authenticated, user-keyed layout; never persist account data. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const owner = session?.email ?? null
  const tokenRef = useRef(session?.accessToken ?? null)
  const lastStartedAt = useRef(0)
  const [revision, setRevision] = useState(0)
  const [usage, setUsage] = useState(initial<AccountUsageResponse>)
  const [subscription, setSubscription] = useState(initial<AccountSubscriptionResponse>)
  const reload = useCallback(() => setRevision((current) => current + 1), [])

  useEffect(() => { tokenRef.current = session?.accessToken ?? null }, [session?.accessToken])

  useEffect(() => {
    const token = tokenRef.current
    if (!owner || !token) return
    const controller = new AbortController()
    let disposed = false
    lastStartedAt.current = Date.now()
    setUsage((current) => ({ ...current, loading: true, failed: false }))
    setSubscription((current) => ({ ...current, loading: true, failed: false }))
    const timeout = window.setTimeout(() => {
      controller.abort()
      if (disposed) return
      // One successful endpoint must stay visible even when the other hangs.
      setUsage((current) => current.loading ? { ...current, loading: false, failed: true } : current)
      setSubscription((current) => current.loading ? { ...current, loading: false, failed: true } : current)
    }, REQUEST_TIMEOUT_MS)

    const options = { accessToken: token, signal: controller.signal }
    const usageRequest = getAccountUsage(options).then(
      (data) => { if (!disposed && !controller.signal.aborted) setUsage({ data, loading: false, failed: false }) },
      () => { if (!disposed) setUsage((current) => ({ ...current, loading: false, failed: true })) },
    )
    const subscriptionRequest = getAccountSubscription(options).then(
      (data) => { if (!disposed && !controller.signal.aborted) setSubscription({ data, loading: false, failed: false }) },
      () => { if (!disposed) setSubscription((current) => ({ ...current, loading: false, failed: true })) },
    )
    void Promise.all([usageRequest, subscriptionRequest]).then(() => window.clearTimeout(timeout))
    return () => {
      disposed = true
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [owner, revision])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible' &&
          Date.now() - lastStartedAt.current >= FOCUS_REFRESH_INTERVAL_MS) reload()
    }
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [reload])

  useEffect(() => {
    const dates = [usage.data?.resets_at, subscription.data?.current_period_end]
      .filter((value): value is string => Boolean(value))
      .map((value) => Date.parse(value) - Date.now())
      .filter((delay) => delay > 0 && delay < 2_147_483_000)
    if (dates.length === 0) return
    const timer = window.setTimeout(reload, Math.min(...dates) + 50)
    return () => window.clearTimeout(timer)
  }, [usage.data, subscription.data, reload])

  const value = useMemo(() => ({ usage, subscription, reload }), [usage, subscription, reload])
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}
