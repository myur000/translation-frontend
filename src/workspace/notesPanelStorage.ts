import { DEFAULT_FLOAT_RECT, parseFloatRect, type FloatRect } from './notesWindowGeometry.ts'

/**
 * Заметки в рабочей области: открыты ли, в каком виде и где. Это привычка
 * читателя, а не свойство книги, поэтому состояние одно на аккаунт (в отличие
 * от раскладки, которая запоминается для каждого документа).
 *
 * Видов два: плавающее окно над книгой (`floating`) и колонка у края (`docked`).
 * Окно можно свернуть в пилюлю (`isCollapsed`); для колонки флаг не действует.
 */
export type NotesSide = 'left' | 'right'
export type NotesMode = 'floating' | 'docked'

export interface NotesPanelSettings {
  isOpen: boolean
  mode: NotesMode
  isCollapsed: boolean
  /** Ширина колонки у края. */
  width: number
  side: NotesSide
  floatRect: FloatRect
}

export const NOTES_MIN_WIDTH = 280
export const NOTES_MAX_WIDTH = 560
export const NOTES_DEFAULT_WIDTH = 360

export const DEFAULT_NOTES_PANEL: NotesPanelSettings = {
  isOpen: false,
  mode: 'floating',
  isCollapsed: false,
  width: NOTES_DEFAULT_WIDTH,
  side: 'right',
  floatRect: DEFAULT_FLOAT_RECT,
}

const KEY_PREFIX = 'parallel.notes-panel.v2.'
/** Запись до появления окна: только колонка у края. */
const LEGACY_KEY_PREFIX = 'parallel.notes-panel.v1.'

export function clampNotesWidth(width: number) {
  return Math.round(Math.min(NOTES_MAX_WIDTH, Math.max(NOTES_MIN_WIDTH, width)))
}

const normalizedEmail = (email: string) => email.trim().toLowerCase()
const storageKey = (email: string) => `${KEY_PREFIX}${normalizedEmail(email)}`
const legacyStorageKey = (email: string) => `${LEGACY_KEY_PREFIX}${normalizedEmail(email)}`

function asRecord(value: unknown) {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

function parseWidth(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? clampNotesWidth(value) : NOTES_DEFAULT_WIDTH
}

/** Разбор сохранённого значения: каждое поле проверяется отдельно, мусор заменяется умолчанием. */
export function parseNotesPanel(value: unknown): NotesPanelSettings {
  const record = asRecord(value)
  if (!record) return DEFAULT_NOTES_PANEL
  return {
    isOpen: record.isOpen === true,
    mode: record.mode === 'docked' ? 'docked' : 'floating',
    isCollapsed: record.isCollapsed === true,
    width: parseWidth(record.width),
    side: record.side === 'left' ? 'left' : 'right',
    floatRect: parseFloatRect(record.floatRect),
  }
}

/**
 * Запись `.v1` знала только колонку у края. Кто держал её открытой, привык к
 * колонке — он её и получает; остальным достаётся новый вид по умолчанию, окно.
 */
export function migrateNotesPanelV1(value: unknown): NotesPanelSettings {
  const record = asRecord(value)
  if (!record) return DEFAULT_NOTES_PANEL
  const isOpen = record.isOpen === true
  return {
    ...DEFAULT_NOTES_PANEL,
    isOpen,
    mode: isOpen ? 'docked' : 'floating',
    width: parseWidth(record.width),
    side: record.side === 'left' ? 'left' : 'right',
  }
}

export function readNotesPanel(email: string): NotesPanelSettings {
  try {
    const current = localStorage.getItem(storageKey(email))
    if (current !== null) return parseNotesPanel(JSON.parse(current))
    const legacy = localStorage.getItem(legacyStorageKey(email))
    return legacy === null ? DEFAULT_NOTES_PANEL : migrateNotesPanelV1(JSON.parse(legacy))
  } catch {
    // Повреждённая запись или недоступное хранилище: заметки как в первый раз.
    return DEFAULT_NOTES_PANEL
  }
}

export function rememberNotesPanel(email: string, settings: NotesPanelSettings) {
  try {
    localStorage.setItem(storageKey(email), JSON.stringify(settings))
    // Миграция закончена: старая запись больше не читается.
    localStorage.removeItem(legacyStorageKey(email))
  } catch {
    // Приватный режим или переполнение: состояние действует до перезагрузки.
  }
}
