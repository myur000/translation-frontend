import { useEffect, useMemo, useState } from 'react'
import type { AssetState, DocumentAsset, DocumentView } from '../viewer/types.ts'

export function useDocumentView(source: AssetState): DocumentView {
  const asset = source.status === 'ready' ? source.asset : null
  const [loaded, setLoaded] = useState<{ asset: DocumentAsset; view: DocumentView } | null>(null)
  // Текст уже разобран сервером; вид пересоздаётся только вместе с источником.
  const textView = useMemo<DocumentView | null>(() => source.status === 'text'
    ? { status: 'ready', kind: 'text', paragraphs: source.paragraphs, truncated: source.truncated, pageCount: null }
    : null, [source])
  useEffect(() => {
    if (!asset || asset.format === 'doc') return
    const controller = new AbortController()
    const load = async () => {
      try {
        let view: DocumentView
        if (asset.format === 'pdf') {
          const { openPdf } = await import('../viewer/pdfEngine.ts')
          if (controller.signal.aborted) return
          const result = await openPdf(asset.blob, controller.signal)
          view = { status: 'ready', kind: 'pdf', ...result, pageCount: result.pdf.numPages }
        } else {
          const { openDocx } = await import('../viewer/docxEngine.ts')
          if (controller.signal.aborted) return
          view = { status: 'ready', kind: 'docx', html: await openDocx(asset.blob, controller.signal), pageCount: null }
        }
        if (!controller.signal.aborted) setLoaded({ asset, view })
      } catch (error) {
        if (controller.signal.aborted) return
        const message = error instanceof Error && error.message === 'PREVIEW_TOO_LARGE'
          ? 'viewer.tooManyPages'
          : error instanceof Error && error.name === 'PasswordException'
            ? 'viewer.passwordProtected' : 'viewer.invalidFile'
        setLoaded({ asset, view: { status: 'message', message } })
      }
    }
    void load()
    return () => controller.abort()
  }, [asset])

  // textView строится из того же source, поэтому запасная ветка недостижима и нужна только типам.
  if (source.status === 'text') return textView ?? { status: 'loading' }
  if (source.status !== 'ready') return source
  if (source.asset.format === 'doc') return { status: 'message', message: 'viewer.legacyDoc' }
  return loaded?.asset === source.asset ? loaded.view : { status: 'loading' }
}
