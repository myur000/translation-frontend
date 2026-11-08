import { useTranslation } from '../../i18n/useTranslation.ts'
import type { DocumentItem } from '../../types/document.ts'
import { DocumentActionsMenu, type DocumentAction } from './DocumentActionsMenu.tsx'
import styles from './DocumentHeader.module.css'

interface DocumentHeaderProps {
  document: DocumentItem
  /** Короткие сведения после названия: страницы, списание, глоссарий. */
  details: string[]
  isPinned: boolean
  actions: DocumentAction[]
}

/**
 * Тонкая матовая полоса над колонками: только название документа и меню «⋯».
 * Всё, что относится к работе с текстом, живёт в нижней панели.
 */
export function DocumentHeader({ document, details, isPinned, actions }: DocumentHeaderProps) {
  const { t } = useTranslation()

  return (
    <header className={styles.header}>
      <div className={styles.title}>
        {isPinned ? (
          <svg className={styles.pin} viewBox="0 0 16 16" role="img" aria-label={t('document.pinned')}>
            <path d="M6 2.5h4l-.6 4 2.1 2.2H4.5l2.1-2.2zM8 8.7v4.8" />
          </svg>
        ) : null}
        <h1 className={styles.name} title={document.name}>{document.name}</h1>
        {details.length ? <span className={styles.details}>{details.join(' · ')}</span> : null}
      </div>
      {actions.length ? (
        <DocumentActionsMenu className={styles.menu} variant="quiet" portal actions={actions} />
      ) : null}
    </header>
  )
}
