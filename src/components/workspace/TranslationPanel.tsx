import type { ComponentProps } from 'react'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { DocumentPreview } from './DocumentPreview.tsx'

type TranslationPanelProps = Omit<ComponentProps<typeof DocumentPreview>, 'label'>

export function TranslationPanel(props: TranslationPanelProps) {
  const { t } = useTranslation()
  return <DocumentPreview {...props} label={t('panel.translation')} />
}
