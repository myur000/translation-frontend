import mammoth from 'mammoth'
import DOMPurify from 'dompurify'
import { readBlob } from './readBlob.ts'

export function sanitizeDocumentHtml(html: string) {
  const template = document.createElement('template')
  template.innerHTML = html
  // DOMPurify allows some image data URIs independently of ALLOWED_URI_REGEXP.
  // Apply our raster-only policy in inert markup, then sanitize as the last step.
  for (const image of template.content.querySelectorAll('img')) {
    if (!/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(image.getAttribute('src') ?? '')) image.removeAttribute('src')
  }
  return DOMPurify.sanitize(template.innerHTML, {
    ALLOWED_TAGS: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'strong', 'em', 'b', 'i', 'u', 's', 'sup', 'sub', 'blockquote', 'span', 'img', 'a'],
    ALLOWED_ATTR: ['src', 'alt', 'colspan', 'rowspan'],
    ALLOWED_URI_REGEXP: /^data:image\/(?:png|jpeg|gif|webp);base64,/i,
  })
}

export async function openDocx(blob: Blob, signal: AbortSignal) {
  const arrayBuffer = await readBlob(blob, signal)
  const result = await mammoth.convertToHtml({ arrayBuffer }, {
    externalFileAccess: false, includeEmbeddedStyleMap: false,
    convertImage: mammoth.images.imgElement(async (image) => {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(image.contentType)) return { src: '' }
      return { src: `data:${image.contentType};base64,${await image.readAsBase64String()}` }
    }),
  })
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  return sanitizeDocumentHtml(result.value)
}
