export function readBlob(blob: Blob, signal: AbortSignal): Promise<ArrayBuffer> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const abort = () => { reader.abort(); reject(new DOMException('Aborted', 'AbortError')) }
    const finish = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    reader.onload = () => { finish(); resolve(reader.result as ArrayBuffer) }
    reader.onerror = () => { finish(); reject(reader.error ?? new Error('File read failed')) }
    reader.onabort = finish
    reader.readAsArrayBuffer(blob)
  })
}
