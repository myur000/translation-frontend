import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ProfileResponse, UpdateProfileRequest } from '../api/contracts/profile.ts'
import type { ApiCallOptions } from '../api/client.ts'
import { deleteAvatar, getProfile, updateProfile, uploadAvatar } from '../api/profile.ts'
import { useAuth } from '../auth/useAuth.ts'
import { abortable } from '../api/abortable.ts'
import { useProfileAvatar } from './useProfileAvatar.ts'
import { ProfileContext, type ProfileContextValue, type ProfileLoadState } from './ProfileContext.ts'

/** The authenticated layout is keyed by owner. Profile data never goes to storage. */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const owner = session?.email ?? null
  const token = useRef(session?.accessToken ?? null)
  const mounted = useRef(false)
  const revision = useRef(0)
  const read = useRef<AbortController | null>(null)
  const write = useRef<AbortController | null>(null)
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [state, setState] = useState<ProfileLoadState>(session ? 'loading' : 'idle')

  const [isMutating, setMutating] = useState(false)
  const [avatarRevision, setAvatarRevision] = useState(0)
  const avatar = useProfileAvatar(profile?.has_avatar === true, avatarRevision, token)

  useEffect(() => { token.current = session?.accessToken ?? null }, [session?.accessToken])

  const reload = useCallback(async () => {
    if (!mounted.current || !token.current || write.current) return
    read.current?.abort()
    const controller = new AbortController()
    read.current = controller
    const currentRevision = ++revision.current
    setState('loading')
    const timeout = window.setTimeout(() => {
      if (mounted.current && revision.current === currentRevision) setState('error')
      controller.abort()
    }, 10_000)
    try {
      const next = await abortable(getProfile({ accessToken: token.current, signal: controller.signal }), controller.signal)
      if (!mounted.current || controller.signal.aborted || revision.current !== currentRevision) return
      setProfile(next)
      setState('ready')
    } catch {
      if (mounted.current && revision.current === currentRevision) setState('error')
    } finally {
      window.clearTimeout(timeout)
      if (read.current === controller) read.current = null
    }
  }, [])

  const runWrite = useCallback(async <T,>(
    operation: (accessToken: string, signal: AbortSignal) => Promise<T>,
    apply: (result: T) => void,
    options: ApiCallOptions,
  ): Promise<T> => {
    if (!mounted.current || !token.current || write.current) throw new Error('Profile unavailable or save in progress')
    read.current?.abort()
    read.current = null
    setState((current) => current === 'loading' ? 'ready' : current)
    const currentRevision = ++revision.current
    const controller = new AbortController()
    write.current = controller
    setMutating(true)
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    try {
      const next = await abortable(operation(token.current, signal), signal)
      if (!mounted.current || signal.aborted || revision.current !== currentRevision) {
        throw new DOMException('Profile request no longer active', 'AbortError')
      }
      apply(next)
      return next
    } finally {
      window.clearTimeout(timeout)
      if (write.current === controller) {
        write.current = null
        if (mounted.current) setMutating(false)
      }
    }
  }, [])

  const save = useCallback((request: UpdateProfileRequest, options: ApiCallOptions = {}) =>
    runWrite((accessToken, signal) => updateProfile(request, { accessToken, signal }), (next) => {
      if (next.email.trim().toLowerCase() !== owner?.trim().toLowerCase()) {
        throw new Error('Profile response belongs to another account')
      }
      setProfile(next)
      setState('ready')
    }, options), [owner, runWrite])

  const changeAvatar = useCallback(async (file: File | null, options: ApiCallOptions = {}) => {
    await runWrite((accessToken, signal) => file
      ? uploadAvatar(file, { accessToken, signal })
      : deleteAvatar({ accessToken, signal }), () => {
      // 204 confirms the mutation; do not fabricate names or timestamps.
      setProfile((current) => current ? { ...current, has_avatar: file !== null } : current)
      setAvatarRevision((current) => current + 1)
    }, options)
  }, [runWrite])

  useEffect(() => {
    mounted.current = true
    void reload()
    return () => {
      mounted.current = false
      revision.current += 1
      read.current?.abort()
      write.current?.abort()
    }
  }, [owner, reload])

  const value = useMemo<ProfileContextValue>(() => ({
    profile, state, reload, save, isMutating, avatar, changeAvatar,
  }), [profile, state, reload, save, isMutating, avatar, changeAvatar])
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}
