import { useCallback, useEffect, useState, type RefObject } from 'react'
import { ApiClientError } from '../api/client.ts'
import { abortable } from '../api/abortable.ts'
import { getAvatar } from '../api/profile.ts'

export interface ProfileAvatarState {
  url: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  retry: () => void
}
interface AvatarResource { key: string; url: string | null; status: ProfileAvatarState['status'] }

/** Each authenticated request owns its object URL and releases it on replacement/unmount. */
export function useProfileAvatar(hasAvatar: boolean, revision: number, token: RefObject<string | null>): ProfileAvatarState {
  const [resource, setResource] = useState<AvatarResource>({ key: '', url: null, status: 'idle' })
  const [retryRevision, setRetryRevision] = useState(0)
  const retry = useCallback(() => setRetryRevision((current) => current + 1), [])
  const key = hasAvatar + ':' + revision + ':' + retryRevision
  useEffect(() => {
    if (!hasAvatar || !token.current) return
    const controller = new AbortController()
    let ownedUrl: string | null = null
    let disposed = false
    const timeout = window.setTimeout(() => controller.abort(), 10_000)
    void abortable(getAvatar({ accessToken: token.current, signal: controller.signal }), controller.signal)
      .then((blob) => {
        if (disposed || controller.signal.aborted) return
        ownedUrl = URL.createObjectURL(blob)
        setResource({ key, url: ownedUrl, status: 'ready' })
      })
      .catch((error: unknown) => {
        if (disposed) return
        setResource({ key, url: null,
          status: error instanceof ApiClientError && error.status === 404 ? 'idle' : 'error' })
      })
      .finally(() => window.clearTimeout(timeout))
    return () => {
      disposed = true
      controller.abort()
      window.clearTimeout(timeout)
      if (ownedUrl) URL.revokeObjectURL(ownedUrl)
    }
  }, [hasAvatar, key, token])
  const current = resource.key === key
  return {
    url: hasAvatar && current ? resource.url : null,
    status: !hasAvatar ? 'idle' : current ? resource.status : 'loading',
    retry,
  }
}
