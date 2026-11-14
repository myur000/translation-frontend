import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_REMEMBERED_LAYOUTS,
  readDocumentLayout,
  rememberDocumentLayout,
} from '../workspace/layoutStorage.ts'
import { LAYOUT_PRESETS, layoutPreset, parseLayout } from '../workspace/workspaceLayout.ts'
import {
  DEFAULT_NOTES_PANEL,
  NOTES_MAX_WIDTH,
  NOTES_MIN_WIDTH,
  parseNotesPanel,
  readNotesPanel,
  rememberNotesPanel,
  type NotesPanelSettings,
} from '../workspace/notesPanelStorage.ts'
import {
  DEFAULT_FLOAT_RECT,
  moveFloatRectBy,
  NOTES_WINDOW_MIN_HEIGHT,
  NOTES_WINDOW_MIN_WIDTH,
  resizeFloatRectBy,
  resolveFloatRect,
  windowArea,
} from '../workspace/notesWindowGeometry.ts'
import { notesPresentation } from '../workspace/useNotesPanel.ts'

const email = 'Reader@Example.com'
const key = 'parallel.workspace-layout.v1.reader@example.com'

afterEach(() => localStorage.clear())

describe('workspace layout model', () => {
  it('maps any pair of reading panes to the preset the switcher shows', () => {
    expect(layoutPreset(LAYOUT_PRESETS.translation)).toBe('translation')
    expect(layoutPreset(LAYOUT_PRESETS.original)).toBe('original')
    // Колонки всегда идут «оригинал | перевод», поэтому порядок мест не важен.
    expect(layoutPreset({ primary: 'original', secondary: 'translation' })).toBe('compare')
  })

  it('accepts only a valid pair of slots from storage', () => {
    expect(parseLayout({ primary: 'translation', secondary: null })).toEqual(LAYOUT_PRESETS.translation)
    expect(parseLayout({ primary: 'translation', secondary: 'translation' })).toBeNull()
    expect(parseLayout({ primary: 'notes', secondary: null })).toBeNull()
    expect(parseLayout({ primary: 'original' })).toBeNull()
    expect(parseLayout('compare')).toBeNull()
  })
})

describe('layout storage', () => {
  it('remembers a layout per document and per account', () => {
    rememberDocumentLayout(email, 'job-1', LAYOUT_PRESETS.translation)

    expect(readDocumentLayout(email, 'job-1')).toEqual(LAYOUT_PRESETS.translation)
    expect(readDocumentLayout(email, 'job-2')).toBeNull()
    expect(readDocumentLayout('other@example.com', 'job-1')).toBeNull()
  })

  it('ignores damaged storage and drops invalid entries', () => {
    localStorage.setItem(key, '{not json')
    expect(readDocumentLayout(email, 'job-1')).toBeNull()

    localStorage.setItem(key, JSON.stringify({
      'job-1': { primary: 'original', secondary: null },
      'job-2': { primary: 'graph', secondary: null },
    }))
    expect(readDocumentLayout(email, 'job-1')).toEqual(LAYOUT_PRESETS.original)
    expect(readDocumentLayout(email, 'job-2')).toBeNull()
  })

  it('forgets the least recently chosen documents beyond the limit', () => {
    for (let index = 0; index <= MAX_REMEMBERED_LAYOUTS; index += 1) {
      rememberDocumentLayout(email, `job-${index}`, LAYOUT_PRESETS.translation)
    }
    // Повторный выбор освежает запись, и она не вытесняется.
    rememberDocumentLayout(email, 'job-1', LAYOUT_PRESETS.original)
    rememberDocumentLayout(email, 'job-new', LAYOUT_PRESETS.translation)

    expect(readDocumentLayout(email, 'job-0')).toBeNull()
    expect(readDocumentLayout(email, 'job-2')).toBeNull()
    expect(readDocumentLayout(email, 'job-1')).toEqual(LAYOUT_PRESETS.original)
    expect(Object.keys(JSON.parse(localStorage.getItem(key)!))).toHaveLength(MAX_REMEMBERED_LAYOUTS)
  })
})

describe('notes panel settings', () => {
  const saved: NotesPanelSettings = {
    isOpen: true, mode: 'docked', isCollapsed: false, width: 420, side: 'left',
    floatRect: { x: 0.25, y: 0.5, width: 300, height: 400 },
  }

  it('replaces each damaged field with its default', () => {
    expect(parseNotesPanel(null)).toEqual(DEFAULT_NOTES_PANEL)
    expect(parseNotesPanel({ isOpen: 'yes', mode: 'tab', isCollapsed: 1, width: 'wide', side: 'top', floatRect: 'corner' }))
      .toEqual(DEFAULT_NOTES_PANEL)
    expect(parseNotesPanel({ isOpen: true, width: 10_000, side: 'left' }))
      .toEqual({ ...DEFAULT_NOTES_PANEL, isOpen: true, width: NOTES_MAX_WIDTH, side: 'left' })
    expect(parseNotesPanel({ width: 12 }).width).toBe(NOTES_MIN_WIDTH)
    // Доли зажимаются в 0…1, размер — не меньше минимального; битое поле не портит соседние.
    expect(parseNotesPanel({ floatRect: { x: 7, y: -2, width: 10, height: Number.NaN } }).floatRect)
      .toEqual({ x: 1, y: 0, width: NOTES_WINDOW_MIN_WIDTH, height: DEFAULT_FLOAT_RECT.height })
  })

  it('opens notes as a window for a new account', () => {
    expect(readNotesPanel('new@example.com')).toMatchObject({ isOpen: false, mode: 'floating', isCollapsed: false })
  })

  it('remembers the notes per account', () => {
    rememberNotesPanel('Reader@Example.com', saved)
    expect(readNotesPanel('reader@example.com')).toEqual(saved)
    expect(readNotesPanel('other@example.com')).toEqual(DEFAULT_NOTES_PANEL)
  })

  it('falls back to defaults for a broken entry', () => {
    localStorage.setItem('parallel.notes-panel.v2.broken@example.com', '{oops')
    expect(readNotesPanel('broken@example.com')).toEqual(DEFAULT_NOTES_PANEL)
    localStorage.setItem('parallel.notes-panel.v2.array@example.com', '[1, 2]')
    expect(readNotesPanel('array@example.com')).toEqual(DEFAULT_NOTES_PANEL)
  })

  it('migrates the column settings from v1', () => {
    localStorage.setItem('parallel.notes-panel.v1.open@example.com', JSON.stringify({ isOpen: true, width: 400, side: 'left' }))
    localStorage.setItem('parallel.notes-panel.v1.closed@example.com', JSON.stringify({ isOpen: false, width: 300, side: 'right' }))

    // Кто держал колонку открытой, получает её же; остальные — новое окно.
    expect(readNotesPanel('open@example.com'))
      .toEqual({ ...DEFAULT_NOTES_PANEL, isOpen: true, mode: 'docked', width: 400, side: 'left' })
    expect(readNotesPanel('closed@example.com'))
      .toEqual({ ...DEFAULT_NOTES_PANEL, isOpen: false, mode: 'floating', width: 300, side: 'right' })

    // После первой записи v2 старая запись больше не нужна.
    rememberNotesPanel('open@example.com', readNotesPanel('open@example.com'))
    expect(localStorage.getItem('parallel.notes-panel.v1.open@example.com')).toBeNull()
    expect(localStorage.getItem('parallel.notes-panel.v2.open@example.com')).not.toBeNull()
  })

  it('prefers v2 over a leftover v1 entry', () => {
    rememberNotesPanel('both@example.com', saved)
    localStorage.setItem('parallel.notes-panel.v1.both@example.com', JSON.stringify({ isOpen: false, width: 300, side: 'right' }))
    expect(readNotesPanel('both@example.com')).toEqual(saved)
  })
})

describe('notes presentation', () => {
  const screen = { isImmersive: false, isNarrow: false }
  const floating = { isOpen: true, mode: 'floating', isCollapsed: false } as const

  it('shows the window, the pill or the column', () => {
    expect(notesPresentation({ ...floating, isOpen: false }, screen)).toBe('hidden')
    expect(notesPresentation(floating, screen)).toBe('floating')
    expect(notesPresentation({ ...floating, isCollapsed: true }, screen)).toBe('collapsed')
    expect(notesPresentation({ ...floating, mode: 'docked' }, screen)).toBe('docked')
  })

  it('keeps the window in fullscreen but hides the column', () => {
    const immersive = { ...screen, isImmersive: true }
    expect(notesPresentation(floating, immersive)).toBe('floating')
    expect(notesPresentation({ ...floating, isCollapsed: true }, immersive)).toBe('collapsed')
    expect(notesPresentation({ ...floating, mode: 'docked' }, immersive)).toBe('hidden')
  })

  it('turns every view into a bottom sheet on a narrow screen', () => {
    const narrow = { ...screen, isNarrow: true }
    expect(notesPresentation(floating, narrow)).toBe('sheet')
    expect(notesPresentation({ ...floating, isCollapsed: true }, narrow)).toBe('sheet')
    expect(notesPresentation({ ...floating, mode: 'docked' }, narrow)).toBe('sheet')
  })
})

describe('notes window geometry', () => {
  // Рабочая область 1000×700 с верхней панелью 60px и нижней 80px.
  const area = windowArea(1000, 700, 60, 80)

  it('starts in the top right corner below the header', () => {
    expect(area).toEqual({ left: 12, top: 72, width: 976, height: 536 })
    expect(resolveFloatRect(DEFAULT_FLOAT_RECT, area)).toEqual({ left: 688, top: 72, width: 300, height: 520 })
  })

  it('moves by keyboard steps and stops at the edges', () => {
    const rect = { x: 0, y: 0, width: 300, height: 300 }
    const moved = moveFloatRectBy(rect, area, 16, 32)
    expect(resolveFloatRect(moved, area)).toMatchObject({ left: 28, top: 104 })

    // Сколько ни двигай, окно не выходит за область и не заезжает под нижнюю панель.
    const farAway = moveFloatRectBy(rect, area, 5000, 5000)
    expect(farAway).toMatchObject({ x: 1, y: 1 })
    const pixel = resolveFloatRect(farAway, area)
    expect(pixel.left + pixel.width).toBe(area.left + area.width)
    expect(pixel.top + pixel.height).toBe(area.top + area.height)
    expect(moveFloatRectBy(rect, area, -100, -100)).toMatchObject({ x: 0, y: 0 })
  })

  it('resizes from the bottom right corner within the area', () => {
    const rect = { x: 0, y: 0, width: 300, height: 300 }
    expect(resizeFloatRectBy(rect, area, 16, -16)).toMatchObject({ width: 316, height: 284 })
    expect(resizeFloatRectBy(rect, area, -1000, -1000))
      .toMatchObject({ width: NOTES_WINDOW_MIN_WIDTH, height: NOTES_WINDOW_MIN_HEIGHT })
    // Растёт только до края: угол окна стоит на месте.
    const grown = resizeFloatRectBy(rect, area, 5000, 5000)
    expect(resolveFloatRect(grown, area)).toEqual({ left: 12, top: 72, width: 976, height: 536 })
  })

  it('stays at the same edge when the area shrinks', () => {
    // Окно прижато к правому краю; рабочая область сузилась — например, открыли боковую панель.
    const rect = { x: 1, y: 0.5, width: 360, height: 400 }
    const narrow = windowArea(600, 500, 60, 80)
    const pixel = resolveFloatRect(rect, narrow)
    expect(pixel.left + pixel.width).toBe(narrow.left + narrow.width)
    expect(pixel.height).toBe(narrow.height)
    // В крошечной области окно её заполняет, но не вылезает.
    expect(resolveFloatRect(rect, windowArea(200, 260, 0, 0))).toEqual({ left: 12, top: 12, width: 176, height: 236 })
  })
})
