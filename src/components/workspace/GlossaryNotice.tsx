import { useTranslation } from '../../i18n/useTranslation.ts'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'
import styles from './GlossaryNotice.module.css'

interface GlossaryNoticeProps {
  term: string
  translation: string
  onRetranslate: () => void
  onClose: () => void
}

/**
 * После нового термина: перевод книги сделан без него, глоссарий действует на
 * следующие переводы. Предлагаем перевести заново — с отмеченным глоссарием.
 */
export function GlossaryNotice({ term, translation, onRetranslate, onClose }: GlossaryNoticeProps) {
  const { t } = useTranslation()
  return (
    <section className={styles.card} role="status" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
      <span className={styles.icon} aria-hidden="true"><GlyphIcon name="glossary" /></span>
      <p className={styles.text}>
        {t('glossary.saved', { term, translation })}
        <span>{t('glossary.savedHint')}</span>
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onRetranslate}>{t('glossary.retranslate')}</button>
        <button type="button" className={styles.quiet} onClick={onClose}>{t('glossary.later')}</button>
      </div>
    </section>
  )
}
