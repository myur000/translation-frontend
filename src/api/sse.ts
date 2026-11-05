export interface ServerSentEvent {
  /** `message` when the server sent no `event:` field. */
  event: string
  data: string
  id: string | null
}

/**
 * Reads a `text/event-stream` body and calls `onEvent` for every dispatched
 * event, following the WHATWG parsing rules: CRLF/LF/CR line endings, one
 * optional space after the colon (`event:ready` and `event: ready` are the
 * same), multi-line `data`, `:` comments (heartbeats) ignored, events
 * without data ignored. Resolves when the server closes the stream.
 */
export async function readServerSentEvents(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ServerSentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = stream.getReader()
  // `stream: true` keeps multi-byte characters split across chunks intact.
  const decoder = new TextDecoder()
  const cancel = () => void reader.cancel().catch(() => undefined)
  signal?.addEventListener('abort', cancel, { once: true })

  let buffer = ''
  let eventType = ''
  let data: string[] = []
  let lastEventId: string | null = null

  const dispatch = () => {
    if (data.length) onEvent({ event: eventType || 'message', data: data.join('\n'), id: lastEventId })
    eventType = ''
    data = []
  }

  const processLine = (line: string) => {
    if (line === '') return dispatch()
    if (line.startsWith(':')) return
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') eventType = value
    else if (field === 'data') data.push(value)
    else if (field === 'id' && !value.includes('\0')) lastEventId = value
  }

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // A trailing "\r" may be the first half of "\r\n": keep it for the next chunk.
      const lines = buffer.split(/\r\n|\n|\r(?!$)/)
      buffer = lines.pop() ?? ''
      lines.forEach(processLine)
    }
    // A held-back "\r" is a complete line once the stream has ended; any other
    // unterminated remainder is an unfinished event and is dropped.
    buffer += decoder.decode()
    if (buffer.endsWith('\r')) processLine(buffer.slice(0, -1))
  } finally {
    signal?.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}
