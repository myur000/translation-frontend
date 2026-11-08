import { describe, expect, it } from 'vitest'
import type { DocumentHistoryItemResponse } from '../api/contracts/documents.ts'
import { historyItemsToDocuments } from '../documents/documentHistory.ts'

const item = (jobId: string, overrides: Partial<DocumentHistoryItemResponse> = {}): DocumentHistoryItemResponse => ({
  job_id: jobId, source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', format: 'docx',
  status: 'FAILED', progress: 5, created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z',
  error_code: 'TRANSLATION_FAILED', error_message: null, billed_units: 1, file_name: null,
  glossary_term_count: null, ...overrides,
})

describe('historyItemsToDocuments', () => {
  it('keeps ids unique when a retried document shares its local id', () => {
    // Повтор (самый новый) и исходная упавшая задача обе указывают на "local-1".
    const metadata = {
      'job-new': { name: 'Отчёт.docx', documentId: 'local-1' },
      'job-old': { name: 'Отчёт.docx', documentId: 'local-1' },
    }

    const documents = historyItemsToDocuments([item('job-new'), item('job-old')], metadata)

    expect(documents.map((document) => document.id)).toEqual(['local-1', 'job-old'])
    expect(documents.map((document) => document.name)).toEqual(['Отчёт.docx', 'Отчёт.docx'])
  })

  it('does not give a retried job the id of the job it retried', () => {
    // У документа из истории id — это job id; при повторе этот id сохранился для новой задачи.
    const metadata = { 'job-new': { name: 'Отчёт.docx', documentId: 'job-old' } }

    const documents = historyItemsToDocuments([item('job-new'), item('job-old')], metadata)

    expect(documents.map((document) => document.id)).toEqual(['job-new', 'job-old'])
  })

  it('avoids ids already used by documents on the page', () => {
    const [document] = historyItemsToDocuments(
      [item('job-1')],
      { 'job-1': { name: 'a.docx', documentId: 'local-1' } },
      new Set(['local-1']),
    )
    expect(document.id).toBe('job-1')
  })

  it('prefers the backend file name and keeps billing data', () => {
    const [document] = historyItemsToDocuments(
      [item('job-1', { file_name: 'Договор.docx', billed_units: 7, glossary_term_count: 0 })],
      { 'job-1': { name: 'local-name.docx', documentId: 'local-1' } },
    )
    expect(document).toMatchObject({ name: 'Договор.docx', billedUnits: 7, glossaryTermCount: 0 })
  })
})
