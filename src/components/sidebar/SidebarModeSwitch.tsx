import { Link } from 'react-router'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './SidebarModeSwitch.module.css'

export type SidebarMode = 'books' | 'notes'

interface SidebarModeSwitchProps {
  mode: SidebarMode
  /** Последний адрес раздела: переключатель возвращает туда, где пользователь был. */
  booksPath: string
  notesPath: string
  isCollapsed: boolean
}

/** Переключатель разделов «Книги | Заметки»: одна боковая панель, два содержимых. */
export function SidebarModeSwitch({ mode, booksPath, notesPath, isCollapsed }: SidebarModeSwitchProps) {
  const { t } = useTranslation()
  const items = [
    { mode: 'books' as const, to: booksPath, label: t('sidebar.modeBooks'), icon: <BooksIcon /> },
    { mode: 'notes' as const, to: notesPath, label: t('sidebar.modeNotes'), icon: <NotesIcon /> },
  ]
  return (
    <nav className={`${styles.switch} ${isCollapsed ? styles.collapsed : ''}`} aria-label={t('sidebar.modeLabel')}>
      {items.map((item) => (
        <Link
          key={item.mode}
          to={item.to}
          className={`${styles.option} ${item.mode === mode ? styles.active : ''}`}
          aria-current={item.mode === mode ? 'page' : undefined}
          aria-label={isCollapsed ? item.label : undefined}
          title={isCollapsed ? item.label : undefined}
        >
          {item.icon}
          <span className={styles.label}>{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}

function BooksIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H15v12H5.5A1.5 1.5 0 0 0 4 16.5v-12Z" />
      <path d="M4 16.5A1.5 1.5 0 0 0 5.5 18H15v-3" />
    </svg>
  )
}

function NotesIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.5 3h6.5l3.5 3.5v9A1.5 1.5 0 0 1 14 17H5.5A1.5 1.5 0 0 1 4 15.5v-11A1.5 1.5 0 0 1 5.5 3Z" />
      <path d="M12 3v3.5h3.5M7 10h6M7 13h4" />
    </svg>
  )
}
