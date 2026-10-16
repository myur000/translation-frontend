export async function abortable<T>(request: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort!: () => void
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new DOMException('Request aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
  try { return await Promise.race([request, aborted]) }
  finally { signal.removeEventListener('abort', onAbort) }
}
