import { useEffect, useState } from 'react'
import type { AssetState, DocumentAsset, DocumentView } from '../viewer/types.ts'

export function useDocumentView(source: AssetState): DocumentView {
  const asset = source.status === 'ready' ? source.asset : null
  const [loaded, setLoaded] = useState<{ asset: DocumentAsset; view: DocumentView } | null>(null)
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

  if (source.status !== 'ready') return source
  if (source.asset.format === 'doc') return { status: 'message', message: 'viewer.legacyDoc' }
  return loaded?.asset === source.asset ? loaded.view : { status: 'loading' }
}
