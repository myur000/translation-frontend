import type { LanguageCode } from '../types/document.ts'

function safeFileName(value: string | null): string | null {
  if (!value) return null
  const leaf = value.split(/[\\/]/).at(-1) ?? ''
  const clean = Array.from(leaf)
    .filter((character) => {
      const code = character.codePointAt(0)!
      return code >= 32 && code !== 127 && !(code >= 0x202a && code <= 0x202e) &&
        !(code >= 0x2066 && code <= 0x2069)
    })
    .join('')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/^\.+|[.\s]+$/g, '')
    .trim()
  if (!clean) return null
  // Keep the extension intact when limiting excessively long server filenames.
  if (Array.from(clean).length <= 200) return clean
  const extension = clean.match(/\.[a-z0-9]{1,10}$/i)?.[0] ?? ''
  return Array.from(clean.slice(0, clean.length - extension.length)).slice(0, 200 - extension.length).join('') + extension
}

export function translationDownloadFileName(
  serverFileName: string | null,
  originalName: string,
  targetLanguage: LanguageCode,
): string {
  const serverName = safeFileName(serverFileName)
  if (serverName) return serverName
  const original = safeFileName(originalName) ?? 'document'
  const extension = original.match(/\.(pdf|docx|doc)$/i)?.[0] ?? ''
  const base = original.slice(0, original.length - extension.length) || 'document'
  return safeFileName(base + '_' + targetLanguage + extension) ?? 'translation'
}

/** Give the browser time to start saving before releasing the Blob URL. */
export function saveDownloadedFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.hidden = true
  try {
    document.body.append(link)
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}
