import { Link } from 'react-router'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './RoutePlaceholder.module.css'

interface RoutePlaceholderProps { eyebrow: string; title: string; description: string; compact?: boolean }

export function RoutePlaceholder({ eyebrow, title, description, compact = false }: RoutePlaceholderProps) {
  const { t } = useTranslation()
  return (
    <div className={`${styles.page} ${compact ? styles.compact : ''}`}>
      <section className={styles.card}>
        <span className={styles.eyebrow}>{eyebrow}</span><h1>{title}</h1><p>{description}</p>
        <Link to="/">{t('common.backToWorkspace')}</Link>
      </section>
    </div>
  )
}
