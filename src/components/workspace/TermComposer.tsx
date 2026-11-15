import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import type { TermListItem, TermResponse } from '../../api/contracts/terms.ts'
import { createTerm, linkTermDocument, updateTerm } from '../../api/terms.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { cleanTermText } from '../../glossary/termMatch.ts'
import { setDraftTermHighlight } from '../../glossary/termRanges.ts'
import {
  autoRange,
  clickWord,
  countWords,
  hasTrimmedPunctuation,
  MAX_TERM_WORDS,
  rangeText,
  splitWords,
  wordAction,
  type WordRange,
} from '../../glossary/termWords.ts'
import type { ActiveQuoteSelection } from '../../hooks/useQuoteSelection.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { noteErrorMessage, type NoteErrorMessage } from '../../notes/noteErrors.ts'
import { NoteErrorText } from '../notes/NoteErrorText.tsx'
import styles from './TermComposer.module.css'

const TERM_MAX = 200
const TRANSLATION_MAX = 500
const WIDTH = 360
const GAP = 10
/** Хук выделения обновляется в rAF — читаем его чуть позже. */
const PICK_DELAY_MS = 80

interface TermComposerProps {
  jobId: string
  selection: ActiveQuoteSelection
  /** Новое выделение заменяет чипы (та же колонка) или заполняет поле (другая). */
  liveSelection: ActiveQuoteSelection | null
  canPickPaired: boolean
  /** По языку выделения отрезается артикль. */
  languages: { source: string; target: string }
  terms: readonly TermListItem[]
  pair: string
  onSaved: (term: TermResponse) => void
  onClose: () => void
}

interface Picked {
  words: string[]
  range: WordRange
  /** После автообрезки: пока не меняли, внизу видно, что отрезано. */
  auto: WordRange
  article: string | null
  free: string | null
}

const selectionKey = (selection: ActiveQuoteSelection) => `${selection.side}\n${selection.text}`

function pick(text: string, language: string): Picked {
  const words = splitWords(text.replace(/\s+/g, ' ').trim())
  if (words.length > MAX_TERM_WORDS) {
    const range = { from: 0, to: words.length - 1 }
    return { words, range, auto: range, article: null, free: cleanTermText(text) }
  }
  const { range, article } = autoRange(words, language)
  return { words, range, auto: range, article, free: null }
}

export function TermComposer({ jobId, selection, liveSelection, canPickPaired, languages, terms, pair, onSaved, onClose }: TermComposerProps) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const side = selection.side
  const language = side === 'SOURCE' ? languages.source : languages.target
  const [picked, setPicked] = useState(() => pick(selection.text, language))
  const [other, setOther] = useState('')
  const [isSaving, setSaving] = useState(false)
  const [error, setError] = useState<NoteErrorMessage | null>(null)
  const cardRef = useRef<HTMLFormElement>(null)
  const otherRef = useRef<HTMLInputElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<Range | null>(selection.range ?? null)
  const [rect, setRect] = useState(selection.rect)
  const [height, setHeight] = useState(0)
  // Сторона выбирается один раз, иначе при прокрутке карточка прыгает.
  const [isAbove, setAbove] = useState<boolean | null>(null)

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const opened = selection.rect
    const measure = () => {
      const measured = card.offsetHeight
      setHeight(measured)
      if (measured) setAbove((current) => current ?? opened.top + opened.height + GAP + measured > window.innerHeight - GAP)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(card)
    return () => observer?.disconnect()
  }, [selection.rect])

  useEffect(() => {
    if (!anchor) return
    setDraftTermHighlight(anchor)
    let frame = 0
    const follow = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const next = anchor.getBoundingClientRect()
        // Узлы слова пропали при перерисовке страницы.
        if (!next.width && !next.height) return
        setRect({ top: next.top, left: next.left, width: next.width, height: next.height })
      })
    }
    follow()
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
      setDraftTermHighlight(null)
    }
  }, [anchor])

  useEffect(() => { otherRef.current?.focus({ preventScroll: true }) }, [])

  // «Сохранить» становится активной только после перерисовки.
  const focusNext = useRef<RefObject<HTMLElement | null> | null>(null)
  useEffect(() => {
    focusNext.current?.current?.focus({ preventScroll: true })
    focusNext.current = null
  })

  // Ждём конца выделения, чтобы не забирать фокус посреди него.
  const latest = useRef(liveSelection)
  useEffect(() => { latest.current = liveSelection })
  const consumed = useRef(selectionKey(selection))
  useEffect(() => {
    let timer = 0
    const take = (event: Event) => {
      if (event.target instanceof Node && cardRef.current?.contains(event.target)) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const next = latest.current
        if (!next || selectionKey(next) === consumed.current) return
        consumed.current = selectionKey(next)
        const text = cleanTermText(next.text)
        if (!text) return
        setError(null)
        if (next.side === side) {
          setPicked(pick(next.text, language))
          if (next.range) setAnchor(next.range)
          focusNext.current = otherRef.current?.value.trim() ? saveRef : otherRef
        } else {
          setOther(text.slice(0, side === 'SOURCE' ? TRANSLATION_MAX : TERM_MAX))
          focusNext.current = saveRef
        }
      }, PICK_DELAY_MS)
    }
    const takeOnKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Shift') take(event) }
    document.addEventListener('pointerup', take)
    document.addEventListener('keyup', takeOnKey)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerup', take)
      document.removeEventListener('keyup', takeOnKey)
    }
  }, [language, side])

  const pickedText = picked.free ?? rangeText(picked.words, picked.range)
  const term = (side === 'SOURCE' ? pickedText : other).trim()
  const translation = (side === 'SOURCE' ? other : pickedText).trim()
  const isTooLong = countWords(term) > MAX_TERM_WORDS
  const existing = term ? terms.find((item) => item.term.toLocaleLowerCase() === term.toLocaleLowerCase()) : undefined
  const canSave = Boolean(term && translation) && !isTooLong && !isSaving

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const token = session?.accessToken
    if (!token || !canSave) return
    setSaving(true)
    setError(null)
    try {
      let saved: TermResponse
      if (existing) {
        await updateTerm(existing.id, { term, translation }, { accessToken: token })
        saved = await linkTermDocument(existing.id, jobId, { accessToken: token })
      } else {
        saved = await createTerm({ term, translation, job_id: jobId }, { accessToken: token })
      }
      onSaved(saved)
    } catch (caught) {
      setError(noteErrorMessage(caught))
      setSaving(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  const isAutoRange = !picked.free && picked.range.from === picked.auto.from && picked.range.to === picked.auto.to
  const trimmedPunctuation = isAutoRange && hasTrimmedPunctuation(picked.words, picked.range)
  const trimmed = !isAutoRange ? null
    : picked.article && trimmedPunctuation ? t('glossary.trimmed.both', { word: picked.article })
      : picked.article ? t('glossary.trimmed.article', { word: picked.article })
        : trimmedPunctuation ? t('glossary.trimmed.punctuation')
          : null
  const footerHint = !other.trim() && canPickPaired
    ? t(side === 'SOURCE' ? 'glossary.hintTranslation' : 'glossary.hintTerm')
    : trimmed
  const pickedLabel = t(side === 'SOURCE' ? 'glossary.term' : 'glossary.translation')
  const otherLabel = t(side === 'SOURCE' ? 'glossary.translation' : 'glossary.term')
  const wanted = isAbove ? rect.top - height - GAP : rect.top + rect.height + GAP
  const top = Math.max(GAP, Math.min(wanted, window.innerHeight - height - GAP))
  const left = Math.max(GAP, Math.min(rect.left + rect.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - GAP))

  return (
    <form
      ref={cardRef}
      className={styles.card}
      style={{ '--composer-top': `${top}px`, '--composer-left': `${left}px` } as CSSProperties}
      aria-label={t('glossary.toGlossary')}
      onSubmit={(event) => void save(event)}
      onKeyDown={handleKeyDown}
      autoComplete="off"
    >
      <div className={styles.header}>
        <span className={styles.title}>{t('glossary.composerTitle', { pair })}</span>
        <button type="button" className={styles.close} aria-label={t('common.close')} title={t('common.close')} onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>

      {picked.free === null ? (
        <>
          <div className={styles.chips} role="group" aria-label={t(side === 'SOURCE' ? 'glossary.termWords' : 'glossary.translationWords')}>
            {picked.words.map((word, index) => {
              const action = wordAction(picked.range, index)
              const isIncluded = action !== 'restore'
              return (
                <button
                  // Слова могут повторяться.
                  key={index}
                  type="button"
                  className={`${styles.chip} ${isIncluded ? '' : styles.chipOut}`}
                  aria-pressed={isIncluded}
                  aria-label={t(`glossary.word.${action}`, { word })}
                  title={t(`glossary.word.${action}`, { word })}
                  onClick={() => setPicked((current) => ({ ...current, range: clickWord(current.range, index) }))}
                >
                  {word}
                </button>
              )
            })}
          </div>
          <p className={styles.caption}>{t(side === 'SOURCE' ? 'glossary.termIs' : 'glossary.translationIs', { text: pickedText })}</p>
        </>
      ) : (
        <input
          className={styles.line}
          aria-label={pickedLabel}
          placeholder={pickedLabel}
          value={picked.free}
          maxLength={side === 'SOURCE' ? TERM_MAX : TRANSLATION_MAX}
          onChange={(event) => {
            const free = event.currentTarget.value
            setPicked((current) => ({ ...current, free }))
            setError(null)
          }}
        />
      )}

      <input
        ref={otherRef}
        className={styles.line}
        aria-label={otherLabel}
        placeholder={otherLabel}
        value={other}
        maxLength={side === 'SOURCE' ? TRANSLATION_MAX : TERM_MAX}
        onChange={(event) => { setOther(event.currentTarget.value); setError(null) }}
      />

      {isTooLong ? <p className={styles.error}>{t('glossary.tooLong', { max: MAX_TERM_WORDS })}</p> : null}
      {existing ? (
        <p className={styles.exists}>{t('glossary.exists', { term: existing.term, translation: existing.translation })}</p>
      ) : null}
      {error ? <p className={styles.error} role="alert"><NoteErrorText message={error} /></p> : null}

      <div className={styles.footer}>
        <span className={styles.hint}>{footerHint}</span>
        <button ref={saveRef} type="submit" className={styles.save} disabled={!canSave}>
          {isSaving ? t('glossary.saving') : t('glossary.save')}
        </button>
      </div>
    </form>
  )
}
