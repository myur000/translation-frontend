import { useCallback, useSyncExternalStore } from 'react'
import { useTranslation } from '../i18n/useTranslation.ts'
import {
  formatLanguageName,
  getLanguageCatalogState,
  loadLanguageCatalog,
  subscribeLanguageCatalog,
} from './languageCatalog.ts'

/**
 * Каталог языков, общий для всех списков на странице. Загрузка явная (`load`),
 * поэтому экраны, которые только показывают подписи, его не запрашивают.
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
