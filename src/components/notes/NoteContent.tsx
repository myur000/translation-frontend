import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import type { NoteLinkResponse } from '../../api/contracts/notes.ts'
import { renderNoteMarkdown } from '../../notes/noteMarkdown.ts'
import styles from './NoteContent.module.css'

interface NoteContentProps {
  body: string
  links: readonly NoteLinkResponse[]
}

/** Отрисованный Markdown заметки. HTML уже очищен в `renderNoteMarkdown`. */
export function NoteContent({ body, links }: NoteContentProps) {
  const navigate = useNavigate()
  const html = useMemo(() => renderNoteMarkdown(body, links), [body, links])
  return (
    <div
      className={styles.markdown}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(event) => {
        // Внутренние ссылки ([[…]], теги) — переход без перезагрузки; с модификаторами — как у браузера.
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        const anchor = (event.target as Element).closest('a[data-note-link]')
        const href = anchor?.getAttribute('href')
        if (!href) return
        event.preventDefault()
        void navigate(href)
      }}
    />
  )
}
