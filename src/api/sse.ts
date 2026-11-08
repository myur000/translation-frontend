export interface ServerSentEvent {
  /** `message`, если сервер не прислал поле `event:`. */
  event: string
  data: string
  id: string | null
}

/**
 * Читает тело `text/event-stream` и вызывает `onEvent` для каждого отправленного события
 * по правилам разбора WHATWG: окончания строк CRLF/LF/CR, один необязательный пробел
 * после двоеточия (`event:ready` и `event: ready` одинаковы), многострочный `data`,
 * комментарии `:` (heartbeat) и события без данных пропускаются.
 * Промис завершается, когда сервер закрывает поток.
 */
export async function readServerSentEvents(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ServerSentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = stream.getReader()
  // `stream: true` сохраняет многобайтовые символы, разрезанные между чанками.
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
      // Завершающий "\r" может быть первой половиной "\r\n": оставляем его до следующего чанка.
      const lines = buffer.split(/\r\n|\n|\r(?!$)/)
      buffer = lines.pop() ?? ''
      lines.forEach(processLine)
    }
    // Отложенный "\r" после конца потока — законченная строка; любой другой
    // незавершённый остаток — недописанное событие, и он отбрасывается.
    buffer += decoder.decode()
    if (buffer.endsWith('\r')) processLine(buffer.slice(0, -1))
  } finally {
    signal?.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}
