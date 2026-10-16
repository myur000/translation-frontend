import type { ComponentProps } from 'react'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { DocumentPreview } from './DocumentPreview.tsx'

type OriginalPanelProps = Omit<ComponentProps<typeof DocumentPreview>, 'label'>

export function OriginalPanel(props: OriginalPanelProps) {
  const { t } = useTranslation()
  return <DocumentPreview {...props} label={t('panel.original')} />
}
