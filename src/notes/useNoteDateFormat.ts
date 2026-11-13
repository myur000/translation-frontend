import { useMemo } from 'react'
import { useTranslation } from '../i18n/useTranslation.ts'

/** Дата изменения заметки на языке интерфейса: «9 ноября 2026 г., 14:05». */
export function useNoteDateFormat() {
  const { language } = useTranslation()
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    return (value: string) => format.format(new Date(value))
  }, [language])
}
