import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import type { TermListItem, TermResponse } from '../../api/contracts/terms.ts'
import { createTerm, linkTermDocument, updateTerm } from '../../api/terms.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { cleanTermText } from '../../glossary/termMatch.ts'
import type { ActiveQuoteSelection } from '../../hooks/useQuoteSelection.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { noteErrorMessage, type NoteErrorMessage } from '../../notes/noteErrors.ts'
import { NoteErrorText } from '../notes/NoteErrorText.tsx'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'
import styles from './TermComposer.module.css'

const TERM_MAX = 200
const TRANSLATION_MAX = 500
const WIDTH = 340
const GAP = 10
/** Выделение во второй колонке читается после того, как его закончили: хук выделения обновляется в кадре анимации. */
const PICK_DELAY_MS = 80

interface TermComposerProps {
  jobId: string
  /** Выделение, с которого начали: оригинал — термин, перевод — перевод термина. */
  selection: ActiveQuoteSelection
  /** Текущее выделение в книге: пока карточка открыта, им заполняют второе поле. */
  liveSelection: ActiveQuoteSelection | null
  /** Видна вторая колонка — значит, второе поле можно взять выделением. */
  canPickPaired: boolean
  /** Термины пары: совпадение с существующим показывается и обновляет его. */
  terms: readonly TermListItem[]
  /** «EN → RU». */
  pair: string
  onSaved: (term: TermResponse) => void
  onClose: () => void
}

const selectionKey = (selection: ActiveQuoteSelection) => `${selection.side}\n${selection.text}`

/**
 * Быстрая карточка «В глоссарий» у выделения. Сохраняет пару «термин → перевод»
 * с привязкой к книге: язык пары берётся из книги на сервере. Если такой термин
 * в паре уже есть — меняется его перевод, а книга добавляется к его книгам.
 */
export function TermComposer({ jobId, selection, liveSelection, canPickPaired, terms, pair, onSaved, onClose }: TermComposerProps) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const fromSource = selection.side === 'SOURCE'
  const initial = cleanTermText(selection.text)
  const [term, setTerm] = useState(() => (fromSource ? initial.slice(0, TERM_MAX) : ''))
  const [translation, setTranslation] = useState(() => (fromSource ? '' : initial.slice(0, TRANSLATION_MAX)))
  const [isSaving, setSaving] = useState(false)
  const [error, setError] = useState<NoteErrorMessage | null>(null)
  const cardRef = useRef<HTMLFormElement>(null)
  const termRef = useRef<HTMLInputElement>(null)
  const translationRef = useRef<HTMLInputElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const [top, setTop] = useState(selection.rect.top + selection.rect.height + GAP)

  // Под выделением, а если снизу не помещается — над ним.
  useLayoutEffect(() => {
    const height = cardRef.current?.offsetHeight ?? 0
    const { rect } = selection
    const below = rect.top + rect.height + GAP
    setTop(below + height <= window.innerHeight - GAP ? below : Math.max(GAP, rect.top - height - GAP))
  }, [selection])

  useEffect(() => {
    ;(fromSource ? translationRef : termRef).current?.focus({ preventScroll: true })
  }, [fromSource])

  // Выделение во второй колонке подставляется во второе поле, когда его закончили:
  // пока тянут мышью или Shift+стрелками, фокус не забираем.
  const latest = useRef(liveSelection)
  useEffect(() => { latest.current = liveSelection })
  const consumed = useRef(selectionKey(selection))
  // Куда перевести фокус после подстановки: кнопка «Сохранить» активна только после перерисовки.
  const focusNext = useRef<RefObject<HTMLElement | null> | null>(null)
  useEffect(() => {
    focusNext.current?.current?.focus({ preventScroll: true })
    focusNext.current = null
  })
  useEffect(() => {
    let timer = 0
    const pick = (event: Event) => {
      if (event.target instanceof Node && cardRef.current?.contains(event.target)) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const next = latest.current
        if (!next || selectionKey(next) === consumed.current) return
        consumed.current = selectionKey(next)
        const text = cleanTermText(next.text)
        if (!text) return
        if (next.side === 'SOURCE') setTerm(text.slice(0, TERM_MAX))
        else setTranslation(text.slice(0, TRANSLATION_MAX))
        setError(null)
        // Второе поле ещё пустое — курсор туда, оба заполнены — на «Сохранить».
        const otherEmpty = next.side === 'SOURCE' ? !translationRef.current?.value.trim() : !termRef.current?.value.trim()
        focusNext.current = otherEmpty ? (next.side === 'SOURCE' ? translationRef : termRef) : saveRef
      }, PICK_DELAY_MS)
    }
    const pickOnKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Shift') pick(event) }
    document.addEventListener('pointerup', pick)
    document.addEventListener('keyup', pickOnKey)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerup', pick)
      document.removeEventListener('keyup', pickOnKey)
    }
  }, [])

  const cleanTerm = term.trim()
  const cleanTranslation = translation.trim()
  const existing = cleanTerm ? terms.find((item) => item.term.toLocaleLowerCase() === cleanTerm.toLocaleLowerCase()) : undefined
  const canSave = Boolean(cleanTerm && cleanTranslation) && !isSaving

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const token = session?.accessToken
    if (!token || !canSave) return
    setSaving(true)
    setError(null)
    try {
      let saved: TermResponse
      if (existing) {
        await updateTerm(existing.id, { term: cleanTerm, translation: cleanTranslation }, { accessToken: token })
        saved = await linkTermDocument(existing.id, jobId, { accessToken: token })
      } else {
        saved = await createTerm({ term: cleanTerm, translation: cleanTranslation, job_id: jobId }, { accessToken: token })
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

  const hint = !canPickPaired ? null
    : !cleanTranslation && fromSource ? t('glossary.hintTranslation')
      : !cleanTerm && !fromSource ? t('glossary.hintTerm')
        : null
  const left = Math.max(GAP, Math.min(selection.rect.left + selection.rect.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - GAP))

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
        <span className={styles.title}>
          <GlyphIcon name="glossary" />
          {t('glossary.composerTitle', { pair })}
        </span>
        <button type="button" className={styles.close} aria-label={t('common.close')} title={t('common.close')} onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>
      <label className={styles.field}>
        <span>{t('glossary.term')}</span>
        <input ref={termRef} className={styles.termInput} value={term} maxLength={TERM_MAX}
          onChange={(event) => { setTerm(event.currentTarget.value); setError(null) }} />
      </label>
      <label className={styles.field}>
        <span>{t('glossary.translation')}</span>
        <input ref={translationRef} value={translation} maxLength={TRANSLATION_MAX}
          onChange={(event) => { setTranslation(event.currentTarget.value); setError(null) }} />
      </label>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {existing ? (
        <p className={styles.exists}>{t('glossary.exists', { term: existing.term, translation: existing.translation })}</p>
      ) : null}
      {error ? <p className={styles.error} role="alert"><NoteErrorText message={error} /></p> : null}
      <div className={styles.actions}>
        <button ref={saveRef} type="submit" className={styles.save} disabled={!canSave}>
          {isSaving ? t('glossary.saving') : t('glossary.save')}
        </button>
        <kbd className={styles.kbd}>Enter</kbd>
        <button type="button" className={styles.cancel} onClick={onClose} disabled={isSaving}>{t('common.cancel')}</button>
      </div>
      <p className={styles.footnote}>{t('glossary.footnote')}</p>
    </form>
  )
}
