import { describe, expect, it } from 'vitest'
import { readServerSentEvents, type ServerSentEvent } from '../api/sse.ts'

function streamOf(chunks: (string | Uint8Array)[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      }
      controller.close()
    },
  })
}

async function collect(chunks: (string | Uint8Array)[]) {
  const events: ServerSentEvent[] = []
  await readServerSentEvents(streamOf(chunks), (event) => events.push(event))
  return events
}

describe('readServerSentEvents', () => {
  it('parses the backend format without a space after the colon', async () => {
    expect(await collect(['event:ready\ndata:{"expires_at":"x"}\n\n'])).toEqual([
      { event: 'ready', data: '{"expires_at":"x"}', id: null },
    ])
  })

  it('handles fields split across chunks and every line ending', async () => {
    const events = await collect([
      'event: jo', 'b\r\ndata: {"job_id":"1"}\r', '\n\r\n',
      'event:resync\rdata:{}\r\r',
    ])
    expect(events.map((event) => [event.event, event.data])).toEqual([
      ['job', '{"job_id":"1"}'],
      ['resync', '{}'],
    ])
  })

  it('joins multi-line data and ignores heartbeats and empty events', async () => {
    const events = await collect([': ping\n\n', 'event:skip\n\n', 'data:a\ndata:b\nid:7\n\n'])
    expect(events).toEqual([{ event: 'message', data: 'a\nb', id: '7' }])
  })

  it('keeps a multi-byte character split between chunks', async () => {
    const bytes = new TextEncoder().encode('data:Готово\n\n')
    const events = await collect([bytes.slice(0, 7), bytes.slice(7)])
    expect(events[0].data).toBe('Готово')
  })

  it('does not dispatch an event the server did not finish', async () => {
    expect(await collect(['event:job\ndata:{}'])).toEqual([])
  })
})
