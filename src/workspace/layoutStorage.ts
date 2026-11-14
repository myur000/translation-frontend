import { parseLayout, type WorkspaceLayout } from './workspaceLayout.ts'

/**
 * Раскладка запоминается для каждого документа: одну книгу читают переводом,
 * другой договор сверяют с оригиналом. На backend такой настройки нет, поэтому
 * она живёт в этом браузере, отдельно для каждого аккаунта.
 */
const KEY_PREFIX = 'parallel.workspace-layout.v1.'
/** Старые записи вытесняются: документы удаляются по сроку, а хранилище не бесконечно. */
export const MAX_REMEMBERED_LAYOUTS = 300

type LayoutsByJobId = Record<string, WorkspaceLayout>

function storageKey(email: string) {
  return `${KEY_PREFIX}${email.trim().toLowerCase()}`
}

function readAll(email: string): LayoutsByJobId {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(email)) ?? '{}')
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    const result: LayoutsByJobId = {}
    for (const [jobId, layout] of Object.entries(value)) {
      const parsed = parseLayout(layout)
      if (parsed) result[jobId] = parsed
    }
    return result
  } catch {
    // Повреждённая запись или недоступное хранилище: раскладки просто не помнятся.
    return {}
  }
}

export function readDocumentLayout(email: string, jobId: string): WorkspaceLayout | null {
  return readAll(email)[jobId] ?? null
}

export function rememberDocumentLayout(email: string, jobId: string, layout: WorkspaceLayout) {
  const all = readAll(email)
  // Порядок ключей объекта — порядок вставки: свежая запись уходит в конец,
  // а при переполнении отбрасываются самые давние.
  delete all[jobId]
  all[jobId] = layout
  const entries = Object.entries(all).slice(-MAX_REMEMBERED_LAYOUTS)
  try {
    localStorage.setItem(storageKey(email), JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Приватный режим или переполнение: выбор действует до перезагрузки.
  }
}
