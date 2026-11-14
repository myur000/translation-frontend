/**
 * Заметки в рабочей области: показаны ли и какой ширины колонка. Это привычка
 * читателя, а не свойство книги, поэтому состояние одно на аккаунт (в отличие
 * от раскладки, которая запоминается для каждого документа).
 *
 * Вид у заметок один — колонка справа под шапкой (на телефоне — шторка). Окно,
 * пилюля и выбор стороны были в `.v2` и убраны: способов показать одно и то же
 * было слишком много.
 */
export interface NotesPanelSettings {
  isOpen: boolean
  /** Ширина колонки. */
  width: number
}

export const NOTES_MIN_WIDTH = 280
export const NOTES_MAX_WIDTH = 560
export const NOTES_DEFAULT_WIDTH = 340

export const DEFAULT_NOTES_PANEL: NotesPanelSettings = {
  isOpen: false,
  width: NOTES_DEFAULT_WIDTH,
}

const KEY_PREFIX = 'parallel.notes-panel.v3.'
/** Прежние записи: открыты ли заметки и ширина колонки переносятся, остальное отбрасывается. */
const LEGACY_KEY_PREFIXES = ['parallel.notes-panel.v2.', 'parallel.notes-panel.v1.']

export function clampNotesWidth(width: number) {
  return Math.round(Math.min(NOTES_MAX_WIDTH, Math.max(NOTES_MIN_WIDTH, width)))
}

const normalizedEmail = (email: string) => email.trim().toLowerCase()
const storageKey = (email: string) => `${KEY_PREFIX}${normalizedEmail(email)}`

/** Разбор сохранённого значения любой версии: каждое поле проверяется отдельно. */
export function parseNotesPanel(value: unknown): NotesPanelSettings {
  if (typeof value !== 'object' || value === null) return DEFAULT_NOTES_PANEL
  const record = value as Record<string, unknown>
  return {
    isOpen: record.isOpen === true,
    width: typeof record.width === 'number' && Number.isFinite(record.width)
      ? clampNotesWidth(record.width)
      : NOTES_DEFAULT_WIDTH,
  }
}

export function readNotesPanel(email: string): NotesPanelSettings {
  try {
    for (const prefix of [KEY_PREFIX, ...LEGACY_KEY_PREFIXES]) {
      const raw = localStorage.getItem(`${prefix}${normalizedEmail(email)}`)
      if (raw !== null) return parseNotesPanel(JSON.parse(raw))
    }
  } catch {
    // Повреждённая запись или недоступное хранилище: заметки как в первый раз.
  }
  return DEFAULT_NOTES_PANEL
}

export function rememberNotesPanel(email: string, settings: NotesPanelSettings) {
  try {
    localStorage.setItem(storageKey(email), JSON.stringify(settings))
    // Перенос закончен: прежние записи больше не читаются.
    for (const prefix of LEGACY_KEY_PREFIXES) localStorage.removeItem(`${prefix}${normalizedEmail(email)}`)
  } catch {
    // Приватный режим или переполнение: состояние действует до перезагрузки.
  }
}
