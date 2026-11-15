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
  const saved: NotesPanelSettings = { isOpen: true, width: 420 }

  it('replaces each damaged field with its default', () => {
    expect(parseNotesPanel(null)).toEqual(DEFAULT_NOTES_PANEL)
    expect(parseNotesPanel({ isOpen: 'yes', width: 'wide' })).toEqual(DEFAULT_NOTES_PANEL)
    expect(parseNotesPanel({ isOpen: true, width: 10_000 })).toEqual({ isOpen: true, width: NOTES_MAX_WIDTH })
    expect(parseNotesPanel({ width: 12 }).width).toBe(NOTES_MIN_WIDTH)
  })

  it('starts closed for a new account and remembers the notes per account', () => {
    expect(readNotesPanel('new@example.com')).toEqual(DEFAULT_NOTES_PANEL)
    rememberNotesPanel('Reader@Example.com', saved)
    expect(readNotesPanel('reader@example.com')).toEqual(saved)
    expect(readNotesPanel('other@example.com')).toEqual(DEFAULT_NOTES_PANEL)
  })

  it('falls back to defaults for a broken entry', () => {
    localStorage.setItem('parallel.notes-panel.v3.broken@example.com', '{oops')
    expect(readNotesPanel('broken@example.com')).toEqual(DEFAULT_NOTES_PANEL)
    localStorage.setItem('parallel.notes-panel.v3.array@example.com', '[1, 2]')
    expect(readNotesPanel('array@example.com')).toEqual(DEFAULT_NOTES_PANEL)
  })

  it('keeps whether notes were open and the column width from v2 and v1', () => {
    // В v2 были окно, пилюля и сторона — от них остаются только «открыты» и ширина.
    localStorage.setItem('parallel.notes-panel.v2.window@example.com', JSON.stringify({
      isOpen: true, mode: 'floating', isCollapsed: true, width: 400, side: 'left', floatRect: { x: 1, y: 0, width: 300, height: 400 },
    }))
    localStorage.setItem('parallel.notes-panel.v1.column@example.com', JSON.stringify({ isOpen: false, width: 300, side: 'right' }))
    expect(readNotesPanel('window@example.com')).toEqual({ isOpen: true, width: 400 })
    expect(readNotesPanel('column@example.com')).toEqual({ isOpen: false, width: 300 })

    // После первой записи v3 прежние записи больше не нужны.
    rememberNotesPanel('window@example.com', readNotesPanel('window@example.com'))
    expect(localStorage.getItem('parallel.notes-panel.v2.window@example.com')).toBeNull()
    expect(localStorage.getItem('parallel.notes-panel.v3.window@example.com')).not.toBeNull()
  })

  it('prefers v3 over leftover older entries', () => {
    rememberNotesPanel('both@example.com', saved)
    localStorage.setItem('parallel.notes-panel.v2.both@example.com', JSON.stringify({ isOpen: false, width: 300 }))
    expect(readNotesPanel('both@example.com')).toEqual(saved)
  })
})

describe('notes presentation', () => {
  it('shows a column, and a bottom sheet on a narrow screen', () => {
    expect(notesPresentation({ isOpen: false }, { isNarrow: false })).toBe('hidden')
    expect(notesPresentation({ isOpen: true }, { isNarrow: false })).toBe('column')
    expect(notesPresentation({ isOpen: true }, { isNarrow: true })).toBe('sheet')
    expect(notesPresentation({ isOpen: false }, { isNarrow: true })).toBe('hidden')
  })

  it('shows a card at the quote in comparison and ignores the remembered column there', () => {
    expect(notesPresentation({ isOpen: true }, { isNarrow: false, isCompare: true })).toBe('hidden')
    expect(notesPresentation({ isOpen: false }, { isNarrow: false, isCompare: true, isPopoverOpen: true })).toBe('popover')
    // На телефоне колонки друг под другом: там по-прежнему шторка.
    expect(notesPresentation({ isOpen: true }, { isNarrow: true, isCompare: true })).toBe('sheet')
  })
})
