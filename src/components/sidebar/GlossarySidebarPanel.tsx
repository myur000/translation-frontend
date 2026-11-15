import type { CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { bookTitle, coverTone } from '../../documents/bookTitle.ts'
import { currentPair, documentPair, GLOSSARY_PATH, GLOSSARY_SORTS, glossaryPairs, glossarySearch, readGlossaryQuery, type GlossaryQuery } from '../../glossary/glossaryQuery.ts'
import { useGlossary } from '../../glossary/glossaryStore.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { shortLanguageCode } from '../../languages/languageCatalog.ts'
import { useLanguageCatalog } from '../../languages/useLanguageCatalog.ts'
import type { DocumentItem } from '../../types/document.ts'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'
import styles from './GlossarySidebarPanel.module.css'

interface GlossarySidebarPanelProps {
  isActive: boolean
  documents: DocumentItem[]
}

/** Панель раздела «Глоссарий»: поиск, пара языков, сортировка и книги пары. Пишет в адрес `/glossary`. */
export function GlossarySidebarPanel({ isActive, documents }: GlossarySidebarPanelProps) {
  const { t } = useTranslation()
  const { getLabel } = useLanguageCatalog()
  const location = useLocation()
  const navigate = useNavigate()
  const { terms, status } = useGlossary(isActive)
  const isGlossaryRoute = location.pathname === GLOSSARY_PATH
  const query = readGlossaryQuery(isGlossaryRoute ? location.search : '')
  const pairs = glossaryPairs(terms)
  const books = documents.filter((document) => document.jobId)
  const pair = currentPair(query.pair, pairs, books[0] ? documentPair(books[0]) : null)
  const pairBooks = books.filter((document) => documentPair(document) === pair)

  const go = (next: Partial<GlossaryQuery>) => {
    void navigate({ pathname: GLOSSARY_PATH, search: glossarySearch({ ...query, ...next }) }, { replace: isGlossaryRoute })
  }
  const pairLabel = (source: string, target: string) => `${shortLanguageCode(source)} → ${shortLanguageCode(target)}`

  return (
    <div className={styles.panel}>
      <label className={styles.search}>
        <GlyphIcon name="search" />
        <input
          type="search"
          value={query.q}
          placeholder={t('glossary.search')}
          aria-label={t('glossary.search')}
          onChange={(event) => go({ q: event.currentTarget.value })}
        />
      </label>

      {pairs.length ? (
        <section className={styles.section} aria-labelledby="glossary-pairs">
          <h3 id="glossary-pairs">{t('glossary.pairs')}</h3>
          <div className={styles.pills} role="group" aria-labelledby="glossary-pairs">
            {pairs.map((item) => (
              <button key={item.key} type="button" className={styles.pill} aria-pressed={item.key === pair}
                title={`${getLabel(item.source)} → ${getLabel(item.target)}`}
                onClick={() => go({ pair: item.key, book: null, term: null })}>
                {pairLabel(item.source, item.target)}
                <span className={styles.count}>{item.count}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="glossary-sort">
        <h3 id="glossary-sort">{t('glossary.sort')}</h3>
        <div className={styles.pills} role="group" aria-labelledby="glossary-sort">
          {GLOSSARY_SORTS.map((sort) => (
            <button key={sort} type="button" className={styles.pill} aria-pressed={query.sort === sort} onClick={() => go({ sort })}>
              {t(`glossary.sortBy.${sort}`)}
            </button>
          ))}
        </div>
      </section>

      {pairBooks.length ? (
        <section className={styles.section} aria-label={t('glossary.books')}>
          <h3>{t('glossary.books')}</h3>
          <ul className={styles.books}>
            <li>
              <button type="button" className={styles.book} aria-pressed={!query.book} onClick={() => go({ book: null })}>
                <span className={`${styles.cover} ${styles.coverAll}`} aria-hidden="true" />
                <span className={styles.bookTitle}>{t('glossary.allBooks')}</span>
              </button>
            </li>
            {pairBooks.map((document) => (
              <li key={document.id}>
                <button type="button" className={styles.book} aria-pressed={query.book === document.jobId}
                  onClick={() => go({ book: document.jobId ?? null })}
                  style={{ '--node-tone': `var(--cover-${coverTone(document.name)})` } as CSSProperties}>
                  <span className={styles.cover} aria-hidden="true" />
                  <span className={styles.bookTitle}>{bookTitle(document.name)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {status === 'error' ? <p className={styles.muted} role="alert">{t('glossary.loadError')}</p> : null}
      <p className={styles.muted}>{t('glossary.panelNote')}</p>
    </div>
  )
}
