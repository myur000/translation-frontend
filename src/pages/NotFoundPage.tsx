import { RoutePlaceholder } from '../components/ui/RoutePlaceholder.tsx'
import { useTranslation } from '../i18n/useTranslation.ts'

export function NotFoundPage() {
  const { t } = useTranslation()
  return <RoutePlaceholder eyebrow="404" title={t('notFound.title')} description={t('notFound.description')} />
}
