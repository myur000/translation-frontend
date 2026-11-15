import { useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import type { NoteLinkResponse, NoteQuoteResponse } from '../../api/contracts/notes.ts'
import { bookTitle, coverTone } from '../../documents/bookTitle.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { renderNoteMarkdown } from '../../notes/noteMarkdown.ts'
import { splitQuoteEmbeds } from '../../notes/quoteEmbeds.ts'
import styles from './NoteContent.module.css'

interface NoteContentProps {
  body: string
  links: readonly NoteLinkResponse[]
  /** Цитаты заметки с сервера: по ним цитата в тексте знает книгу, второй язык и место. */
  quotes?: readonly NoteQuoteResponse[]
  /** Действие у цитаты в тексте: «В книге →» на странице заметки, «Показать в книге» у книги. */
  quoteAction?: (quote: NoteQuoteResponse) => ReactNode
}

/**
 * Отрисованный Markdown заметки. HTML уже очищен в `renderNoteMarkdown`. Цитаты
 * из книг внутри текста (`quoteEmbeds.ts`) — карточками на своём месте.
 */
export function NoteContent({ body, links, quotes, quoteAction }: NoteContentProps) {
  const navigate = useNavigate()
  const segments = useMemo(() => splitQuoteEmbeds(body).map((segment) => (segment.kind === 'markdown'
    ? { ...segment, html: renderNoteMarkdown(segment.text, links) }
    : segment)), [body, links])
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    // Внутренние ссылки ([[…]], теги) — переход без перезагрузки; с модификаторами — как у браузера.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as Element).closest('a[data-note-link]')
    const href = anchor?.getAttribute('href')
    if (!href) return
    event.preventDefault()
    void navigate(href)
  }

  if (segments.every((segment) => segment.kind === 'markdown')) {
    const html = segments.map((segment) => ('html' in segment ? segment.html : '')).join('')
    return <div className={styles.markdown} dangerouslySetInnerHTML={{ __html: html }} onClick={handleClick} />
  }
  return (
    <div className={styles.flow} onClick={handleClick}>
      {segments.map((segment, index) => (segment.kind === 'markdown'
        ? <div key={index} className={styles.markdown} dangerouslySetInnerHTML={{ __html: segment.html }} />
        : (
          <QuoteInText
            key={`${index}:${segment.quoteId}`}
            text={segment.text}
            label={segment.label}
            quote={quotes?.find((item) => item.id === segment.quoteId)}
            action={quoteAction}
          />
        )))}
    </div>
  )
}

/** Цитата внутри текста: линия слева, как у цитат заметки, под ней книга и место. */
function QuoteInText({ text, label, quote, action }: {
  text: string
  label: string
  quote: NoteQuoteResponse | undefined
  action?: (quote: NoteQuoteResponse) => ReactNode
}) {
  const { t } = useTranslation()
  const [isPairedShown, setPairedShown] = useState(false)
  const name = quote?.document_name ? bookTitle(quote.document_name) : null
  const where = quote
    ? `¶${quote.paragraph_index + 1} · ${t(quote.side === 'SOURCE' ? 'panel.original' : 'panel.translation').toLocaleLowerCase()}`
    : label
  return (
    <figure className={styles.quote} aria-label={name ? t('notes.quoteFrom', { book: name }) : t('notes.quoteInText')}>
      <blockquote className={styles.quoteText}>{text}</blockquote>
      {isPairedShown && quote?.paired_text ? <p className={styles.paired}>{quote.paired_text}</p> : null}
      <figcaption className={styles.quoteMeta}>
        <span className={styles.quoteSource}>
          {name ? <span className={styles.spine} style={{ background: `var(--cover-${coverTone(name)})` }} aria-hidden="true" /> : null}
          {[name, where].filter(Boolean).join(' · ')}
        </span>
        {quote?.paired_text ? (
          <button type="button" className={styles.textButton} aria-pressed={isPairedShown} onClick={() => setPairedShown(!isPairedShown)}>
            {t(quote.side === 'SOURCE' ? 'notes.showTranslation' : 'notes.showOriginal')}
          </button>
        ) : null}
        {quote && action ? action(quote) : null}
      </figcaption>
    </figure>
  )
}
