import { useCallback, useSyncExternalStore } from 'react'

/** Совпадает ли медиазапрос; без `matchMedia` (тесты, старые браузеры) — нет. */
export function useMediaQuery(query: string) {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window.matchMedia !== 'function') return () => {}
    const list = window.matchMedia(query)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  )
}
