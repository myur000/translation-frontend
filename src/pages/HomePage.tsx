import { useId, useRef, useState, type DragEvent } from 'react'
import { Link, useOutletContext } from 'react-router'
import { BrandMark } from '../components/brand/BrandMark.tsx'
import { LanguagePicker } from '../components/languages/LanguagePicker.tsx'
import { DocumentActionsMenu, type DocumentAction } from '../components/toolbar/DocumentActionsMenu.tsx'
import { documentStatusLabel } from '../documents/documentStatusLabel.ts'
import { useTranslation } from '../i18n/useTranslation.ts'
import { DEFAULT_SOURCE_LANGUAGE, DEFAULT_TARGET_LANGUAGE } from '../languages/languageCatalog.ts'
import type { AppLayoutContextValue } from '../layouts/AppLayout.tsx'
import styles from './HomePage.module.css'

const LANGUAGES_KEY = 'parallel.home-languages.v1'
const RECENT_COUNT = 5
const ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

interface LanguagePair {
  source: string
  target: string
}

/** The pair chosen last time is a convenience; the defaults are fine without it. */
function readLanguages(): LanguagePair {
  try {
    const value = JSON.parse(localStorage.getItem(LANGUAGES_KEY) ?? 'null') as Partial<LanguagePair> | null
    if (value && typeof value.source === 'string' && typeof value.target === 'string' && value.source !== value.target) {
      return { source: value.source, target: value.target }
    }
  } catch {
    // Unavailable or malformed storage: fall back to the defaults.
  }
  return { source: DEFAULT_SOURCE_LANGUAGE, target: DEFAULT_TARGET_LANGUAGE }
}

function rememberLanguages(pair: LanguagePair) {
  try {
    localStorage.setItem(LANGUAGES_KEY, JSON.stringify(pair))
  } catch {
    // Private mode: the pair is simply not remembered.
  }
}

/**
 * Entry screen: drop a document or pick one from the device, with the
 * language pair chosen up front. Recent documents are one click away in "+".
 */
export function HomePage() {
  const { documents, prepareDocument, selectDocument } = useOutletContext<AppLayoutContextValue>()
  const { t } = useTranslation()
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [isDragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [languages, setLanguages] = useState(readLanguages)

  const updateLanguages = (next: LanguagePair) => {
    setLanguages(next)
    rememberLanguages(next)
  }
  // Choosing the other side's language swaps the pair instead of making it invalid.
  const changeSource = (source: string) => updateLanguages(source === languages.target
    ? { source, target: languages.source }
    : { ...languages, source })
  const changeTarget = (target: string) => updateLanguages(target === languages.source
    ? { source: languages.target, target }
    : { ...languages, target })

  const open = (file: File | undefined) => {
    if (!file) return
    setError(prepareDocument(file, languages) ?? '')
  }

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files')
  const handleDragEnter = (event: DragEvent) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }
  const handleDragLeave = (event: DragEvent) => {
    if (!hasFiles(event)) return
    // Leaving a child element also fires dragleave; count the depth.
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }
  const handleDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    open(event.dataTransfer.files[0])
  }

  const recent = documents.slice(0, RECENT_COUNT)
  const addActions: DocumentAction[] = [
    { id: 'upload', label: t('home.uploadFromDevice'), onSelect: () => inputRef.current?.click() },
    ...recent.map((document) => ({
      id: `open-${document.id}`,
      label: t('home.openRecent', { name: document.name, status: t(documentStatusLabel(document)) }),
      onSelect: () => selectDocument(document.id),
    })),
  ]

  return (
    <section
      className={styles.page}
      aria-labelledby={`${id}-title`}
      onDragEnter={handleDragEnter}
      onDragOver={(event) => { if (hasFiles(event)) event.preventDefault() }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={styles.column}>
        <h1 id={`${id}-title`} className={styles.title}>
          <BrandMark size={40} className={styles.mark} />
          {t('home.title')}
        </h1>

        <div className={`${styles.card} ${isDragging ? styles.dragging : ''}`}>
          <label className={styles.dropzone} htmlFor={`${id}-file`}>
            <svg className={styles.dropIcon} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5zM14 3.5V8h4M12 17v-6m0 0-2.5 2.5M12 11l2.5 2.5" />
            </svg>
            <span className={styles.dropTitle}>{t(isDragging ? 'home.dropNow' : 'home.dropTitle')}</span>
            <span className={styles.dropHint}>{t('home.dropHint')}</span>
            <input
              ref={inputRef}
              id={`${id}-file`}
              className={styles.fileInput}
              type="file"
              accept={ACCEPT}
              onChange={(event) => {
                open(event.currentTarget.files?.[0])
                event.currentTarget.value = ''
              }}
            />
          </label>
          <div className={styles.cardFooter}>
            <DocumentActionsMenu
              actions={addActions}
              icon="plus"
              align="start"
              portal
              label={t('home.addMenu')}
            />
            <span className={styles.formats}>{t('home.formats')}</span>
          </div>
        </div>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <div className={styles.options}>
          <Link className={styles.historyLink} to="/history">{t('home.allDocuments')}</Link>
          <div className={styles.languages}>
            <LanguagePicker value={languages.source} label={t('toolbar.sourceLanguage')} prefix={t('toolbar.from')} onChange={changeSource} />
            <button
              type="button"
              className={styles.swap}
              aria-label={t('toolbar.swapLanguages')}
              title={t('toolbar.swapLanguages')}
              onClick={() => updateLanguages({ source: languages.target, target: languages.source })}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5.5h9.5m0 0L10 3m2.5 2.5L10 8M13 10.5H3.5m0 0L6 8m-2.5 2.5L6 13" /></svg>
            </button>
            <LanguagePicker value={languages.target} label={t('toolbar.targetLanguage')} prefix={t('toolbar.to')} onChange={changeTarget} />
          </div>
        </div>
      </div>
    </section>
  )
}
