/** Задержка перед поиском: не отправлять запрос на каждую букву. */
export const NOTES_SEARCH_DELAY_MS = 300

/** Фильтры списка заметок живут в адресе: так их понимают ссылки на теги, «Назад» и боковая панель. */
export interface NotesQuery {
  q: string
  tag: string
}

export function readNotesQuery(search: string): NotesQuery {
  const params = new URLSearchParams(search)
  return {
    q: params.get('q')?.trim() ?? '',
    tag: params.get('tag')?.trim().replace(/^#/, '').toLocaleLowerCase('ru') ?? '',
  }
}

/** Строка запроса (с `?` или пустая) для адресов раздела заметок. */
export function notesSearch(query: Partial<NotesQuery>) {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.tag) params.set('tag', query.tag)
  const search = params.toString()
  return search ? `?${search}` : ''
}

export function isNotesPath(pathname: string) {
  return pathname === '/notes' || pathname.startsWith('/notes/')
}
