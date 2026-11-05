import { useCallback, useSyncExternalStore } from 'react'
import { useTranslation } from '../i18n/useTranslation.ts'
import {
  formatLanguageName,
  getLanguageCatalogState,
  loadLanguageCatalog,
  subscribeLanguageCatalog,
} from './languageCatalog.ts'

/**
 * Language catalog shared by every picker on the page. Loading is explicit
 * (`load`), so screens that only show labels do not request it.
 */
export function useLanguageCatalog() {
  const catalog = useSyncExternalStore(
    subscribeLanguageCatalog,
    getLanguageCatalogState,
  )
  const { language } = useTranslation()
  const getLabel = useCallback(
    (code: string) => formatLanguageName(code, language, catalog.names),
    [catalog.names, language],
  )

  return { ...catalog, load: loadLanguageCatalog, getLabel }
}
