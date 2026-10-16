import { useRef, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePreviewZoom } from '../hooks/usePreviewZoom.ts'
import { wheelZoomDelta } from '../viewer/zoomGesture.ts'

let time = 0
let nextId = 0
const frames = new Map<number, FrameRequestCallback>()
beforeEach(() => {
  time = 0
  nextId = 0
  frames.clear()
  vi.spyOn(performance, 'now').mockImplementation(() => time)
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextId
    frames.set(id, callback)
    return id
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function frame() {
  act(() => {
    time += 16
    const scheduled = [...frames.values()]
    frames.clear()
    scheduled.forEach((callback) => callback(time))
  })
}
function Probe({ onChange, initialZoom = 100 }: { onChange: (zoom: number) => void; initialZoom?: number }) {
  const [zoom, setZoom] = useState(initialZoom)
  const viewportRef = useRef<HTMLDivElement>(null)
  usePreviewZoom(viewportRef, zoom, (value) => { onChange(value); setZoom(value) })
  return <>
    <div ref={viewportRef} data-zoom={zoom} aria-label="Book" />
    <button onClick={() => setZoom((value) => value + 10)}>Keyboard increment</button>
  </>
}
function setup(initialZoom = 100) {
  const onChange = vi.fn()
  const rendered = render(<Probe initialZoom={initialZoom} onChange={onChange} />)
  const viewport = screen.getByLabelText('Book')
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 400 })
  return { ...rendered, viewport, onChange }
}
function wheel(viewport: HTMLElement, deltaY: number, options: WheelEventInit = {}) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY, ...options })
  fireEvent(viewport, event)
  return event
}

describe('balanced trackpad zoom', () => {
  it('uses gesture magnitude rather than ten percentage points per event', () => {
    const { viewport, onChange } = setup()
    for (let index = 0; index < 10; index++) wheel(viewport, -1)
    expect(onChange).not.toHaveBeenCalled()
    frame()
    expect(viewport.dataset.zoom).toBe('101')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('retains fractional micro-deltas across rendered frames', () => {
    const { viewport } = setup()
    for (let index = 0; index < 20; index++) {
      wheel(viewport, -0.5)
      frame()
    }
    expect(viewport.dataset.zoom).toBe('101')
    for (let index = 0; index < 20; index++) {
      wheel(viewport, -0.5)
      frame()
    }
    expect(viewport.dataset.zoom).toBe('102')
  })

  it('caps a burst at five points and does not continue zooming after release', () => {
    const { viewport, onChange } = setup()
    for (let index = 0; index < 30; index++) wheel(viewport, -100)
    expect(frames.size).toBe(1)
    frame()
    expect(viewport.dataset.zoom).toBe('105')
    frame()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(0)
  })

  it('balances opposite deltas within a frame without a zoom jump', () => {
    const { viewport, onChange } = setup()
    wheel(viewport, -10)
    wheel(viewport, 10)
    frame()
    expect(viewport.dataset.zoom).toBe('100')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores ordinary two-finger scrolling and zero deltas', () => {
    const { viewport, onChange } = setup()
    expect(wheel(viewport, -100, { ctrlKey: false }).defaultPrevented).toBe(false)
    expect(wheel(viewport, 0).defaultPrevented).toBe(false)
    frame()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('supports Command-wheel and prevents browser zoom inside the book', () => {
    const { viewport } = setup()
    expect(wheel(viewport, -20, { ctrlKey: false, metaKey: true }).defaultPrevented).toBe(true)
    frame()
    expect(viewport.dataset.zoom).toBe('102')
  })

  it('normalizes line and page deltas before changing the scale', () => {
    const { viewport } = setup()
    wheel(viewport, -1, { deltaMode: 1 })
    frame()
    expect(viewport.dataset.zoom).toBe('102')
    wheel(viewport, -1, { deltaMode: 2 })
    frame()
    expect(viewport.dataset.zoom).toBe('107')
  })

  it('keeps the point under the gesture anchored in both scroll axes', () => {
    const { viewport } = setup()
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 80, right: 700, bottom: 480, width: 600, height: 400, x: 100, y: 80, toJSON: () => {},
    })
    viewport.scrollLeft = 100
    viewport.scrollTop = 400
    wheel(viewport, -100, { clientX: 300, clientY: 200 })
    frame()
    expect(viewport.scrollLeft).toBeCloseTo(115)
    expect(viewport.scrollTop).toBeCloseTo(426)
  })

  it('discards a queued gesture when buttons/keyboard change zoom first', () => {
    const { viewport, onChange } = setup()
    wheel(viewport, -100)
    fireEvent.click(screen.getByText('Keyboard increment'))
    frame()
    expect(viewport.dataset.zoom).toBe('110')
    expect(onChange).not.toHaveBeenCalled()
    wheel(viewport, -10)
    frame()
    expect(viewport.dataset.zoom).toBe('111')
  })

  it('does not carry a tiny remainder into a separate gesture', () => {
    const { viewport } = setup()
    wheel(viewport, -4)
    frame()
    expect(viewport.dataset.zoom).toBe('100')
    time += 200
    wheel(viewport, -2)
    frame()
    expect(viewport.dataset.zoom).toBe('100')
  })

  it.each([[248, -100, 250, 100, 245], [51, 100, 50, -100, 55]])(
    'clamps zoom at the boundary and immediately allows reversing (%s)',
    (initial, delta, boundary, reverse, result) => {
      const { viewport } = setup(initial)
      for (let index = 0; index < 5; index++) {
        wheel(viewport, delta)
        frame()
      }
      expect(viewport.dataset.zoom).toBe(String(boundary))
      wheel(viewport, reverse)
      frame()
      expect(viewport.dataset.zoom).toBe(String(result))
    },
  )

  it('cancels pending updates when a fullscreen panel unmounts', () => {
    const { viewport, onChange, unmount } = setup()
    wheel(viewport, -100)
    unmount()
    frame()
    expect(onChange).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
  })
})

describe('wheel delta normalization', () => {
  it.each([
    [-1, 0, 400, 0.1], [-0.1, 0, 400, 0.01],
    [-1, 1, 400, 1.6], [-1, 2, 400, 5],
    [-10000, 0, 400, 5], [10000, 0, 400, -5],
    [NaN, 0, 400, 0], [Infinity, 0, 400, 0],
  ])('normalizes delta %s / mode %s safely', (delta, mode, height, expected) => {
    expect(wheelZoomDelta(delta, mode, height)).toBeCloseTo(expected)
  })
})
