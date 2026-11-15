import { useEffect, useRef, type KeyboardEvent } from 'react'
import { coverInitial } from '../../documents/bookTitle.ts'
import { ForceLayout } from '../../graph/forceLayout.ts'
import { matchesGraphQuery, neighbours, type GraphModel, type GraphNode } from '../../graph/graphModel.ts'
import { fitCamera, linkDistance, nodeAt, nodeRadius, toScreen, toWorld, zoomAt, type Camera } from '../../graph/graphView.ts'
import styles from './GraphCanvas.module.css'

interface GraphCanvasProps {
  /** Видимая часть графа (после фильтров). */
  model: GraphModel
  selectedId: string | null
  /** Поиск: совпавшие узлы обведены акцентом. */
  query: string
  /** Растёт, когда камере нужно подлететь к выбранному узлу (выбор в панели, в списке связей). */
  focusNonce: number
  label: string
  onSelect: (id: string | null) => void
  onOpen: (node: GraphNode) => void
}

interface Palette {
  accent: string
  text: string
  muted: string
  soft: string
  border: string
  surface: string
  canvas: string
  covers: string[]
}

/** Сдвиг больше этого — перетаскивание, а не клик. */
const CLICK_SLOP = 4
/** С какого масштаба подписываются все заметки (книги и конспекты — всегда). */
const LABEL_SCALE = 0.8
const KEY_PAN = 60

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element)
  const value = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    accent: value('--color-accent', '#e8833a'),
    text: value('--color-text', '#e6edf5'),
    muted: value('--color-text-muted', '#9fb1c6'),
    soft: value('--color-text-soft', '#7c90a8'),
    border: value('--color-border', '#2a3b55'),
    surface: value('--color-surface', '#16233a'),
    canvas: value('--color-surface-subtle', '#111d30'),
    covers: Array.from({ length: 6 }, (_, index) => value(`--cover-${index}`, '#7a5a2e')),
  }
}

/**
 * Холст графа: живая силовая раскладка, перетаскивание узлов, сдвиг фона, масштаб
 * колёсиком (вокруг курсора). Наведение подсвечивает узел и его соседей, клик
 * выбирает, двойной клик открывает. Рисуется на canvas — тысячи узлов не нагружают
 * DOM; для клавиатуры и скринридера рядом есть обычный список узлов (`GraphPage`).
 */
export function GraphCanvas({ model, selectedId, query, focusNonce, label, onSelect, onOpen }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef<ForceLayout | null>(null)
  const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: 1 })
  const cameraTarget = useRef<Camera | null>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const hoverRef = useRef<string | null>(null)
  const frameRef = useRef(0)
  // Свежие значения для цикла отрисовки: он живёт дольше одного рендера.
  const state = useRef({ model, selectedId, query, onSelect, onOpen })
  useEffect(() => { state.current = { model, selectedId, query, onSelect, onOpen } })

  const requestDraw = useRef<() => void>(() => {})
  // Подлёт к узлу, которого ещё нет в раскладке (граф догружается) — выполнится после неё.
  const pendingFocus = useRef(false)

  /** Камера летит к выбранному узлу; `instant` — сразу, без полёта (первый кадр). */
  const focusSelected = useRef((instant: boolean) => {
    const id = state.current.selectedId
    const node = id ? layoutRef.current?.node(id) : null
    if (!node) return false
    const target = { x: node.x, y: node.y, scale: Math.max(cameraRef.current.scale, 1.1) }
    if (instant) cameraRef.current = target
    else cameraTarget.current = target
    return true
  })

  // Раскладка пересобирается при смене видимых узлов; узлы, которые остались, — на местах.
  useEffect(() => {
    const known = layoutRef.current?.positions()
    // Раскладка без единого узла (граф ещё грузился) — не «прошлая», начинаем как с нуля.
    const previous = known?.size ? known : undefined
    const layout = new ForceLayout(
      model.nodes.map((node) => ({ id: node.id, radius: nodeRadius(node) })),
      model.links.map((link) => ({ source: link.source, target: link.target, distance: linkDistance(link.kind) })),
      previous,
    )
    layoutRef.current = layout
    if (!previous) {
      // Первый показ: граф сразу в покое и вписан в окно, без «взрыва» на глазах.
      layout.settle(320)
      cameraRef.current = fitCamera(layout.nodes, sizeRef.current)
    }
    if (pendingFocus.current && focusSelected.current(!previous)) pendingFocus.current = false
    requestDraw.current()
  }, [model])

  // Подлететь к выбранному узлу.
  useEffect(() => {
    if (!focusNonce) return
    // Холст ещё не знает своего размера или узла нет в раскладке — подлетим, когда появятся.
    if (!sizeRef.current.width || !focusSelected.current(false)) pendingFocus.current = true
    requestDraw.current()
  }, [focusNonce])

  useEffect(() => { requestDraw.current() }, [selectedId, query])

  // Цикл: пока раскладка не успокоилась или камера летит — шаг и кадр; потом холст спит.
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const context = canvas.getContext('2d')
    // Палитра — из темы; перечитывается при отрисовке, как только тема сменилась.
    let palette = readPalette(container)
    let paletteTheme = document.documentElement.dataset.theme ?? ''

    const draw = () => {
      frameRef.current = 0
      const layout = layoutRef.current
      if (!layout || !context) return
      const theme = document.documentElement.dataset.theme ?? ''
      if (theme !== paletteTheme) {
        palette = readPalette(container)
        paletteTheme = theme
      }
      if (!layout.isSettled) layout.tick()
      const target = cameraTarget.current
      if (target) {
        const camera = cameraRef.current
        const next = {
          x: camera.x + (target.x - camera.x) * 0.2,
          y: camera.y + (target.y - camera.y) * 0.2,
          scale: camera.scale + (target.scale - camera.scale) * 0.2,
        }
        cameraRef.current = next
        if (Math.abs(next.x - target.x) < 0.5 && Math.abs(next.y - target.y) < 0.5 && Math.abs(next.scale - target.scale) < 0.005) {
          cameraRef.current = target
          cameraTarget.current = null
        }
      }
      paint(context, layout, palette)
      if (!layout.isSettled || cameraTarget.current) frameRef.current = window.requestAnimationFrame(draw)
    }
    requestDraw.current = () => {
      if (!frameRef.current) frameRef.current = window.requestAnimationFrame(draw)
    }

    const paint = (ctx: CanvasRenderingContext2D, layout: ForceLayout, colors: Palette) => {
      const { width, height } = sizeRef.current
      const ratio = window.devicePixelRatio || 1
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, width, height)
      const { model: current, selectedId: selected, query: search } = state.current
      const camera = cameraRef.current
      const focus = hoverRef.current ?? selected
      const near = focus ? neighbours(current.links, focus) : null
      const nodesById = new Map(current.nodes.map((node) => [node.id, node]))

      // Связи.
      for (const link of current.links) {
        const source = layout.node(link.source)
        const target = layout.node(link.target)
        if (!source || !target) continue
        const a = toScreen(camera, sizeRef.current, source)
        const b = toScreen(camera, sizeRef.current, target)
        const isHot = Boolean(focus && (link.source === focus || link.target === focus))
        const summary = link.kind === 'about' ? nodesById.get(link.source) : null
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.setLineDash(link.kind === 'about' ? [4, 3] : [])
        ctx.globalAlpha = near && !isHot ? 0.1 : isHot ? 0.95 : link.kind === 'tagged' ? 0.3 : 0.5
        ctx.strokeStyle = isHot
          ? (summary?.tone !== null && summary?.tone !== undefined ? colors.covers[summary.tone] : colors.accent)
          : colors.muted
        ctx.lineWidth = (link.kind === 'quotes' ? 0.8 + Math.min(link.weight, 6) * 0.6 : link.kind === 'about' ? 1.8 : 1) * Math.min(1.4, camera.scale)
        ctx.stroke()
      }
      ctx.setLineDash([])

      // Узлы.
      const showAllLabels = camera.scale >= LABEL_SCALE
      for (const node of current.nodes) {
        const place = layout.node(node.id)
        if (!place) continue
        const p = toScreen(camera, sizeRef.current, place)
        const r = place.radius * camera.scale
        if (p.x < -60 || p.y < -60 || p.x > width + 60 || p.y > height + 60) continue
        const isFocus = node.id === focus
        const isSelected = node.id === selected
        const isMatch = matchesGraphQuery(node.label, search)
        ctx.globalAlpha = near && !near.has(node.id) ? 0.22 : 1
        const tone = node.tone !== null ? colors.covers[node.tone] : colors.muted
        const ring = isSelected || isMatch || isFocus ? colors.accent : null
        if (node.kind === 'book') {
          const w = r * 1.5
          const h = r * 2.1
          ctx.fillStyle = node.deleted ? colors.border : tone
          roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, 3)
          ctx.fill()
          ctx.fillStyle = 'rgba(0,0,0,0.25)'
          ctx.fillRect(p.x - w / 2, p.y - h / 2, Math.max(2, w * 0.13), h)
          if (ring) strokeRound(ctx, p.x - w / 2 - 2, p.y - h / 2 - 2, w + 4, h + 4, 4, ring)
          ctx.fillStyle = '#ffffff'
          ctx.font = `${Math.max(10, r * 0.75)}px Literata, Georgia, serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'alphabetic'
          ctx.fillText(coverInitial(node.label), p.x + w * 0.06, p.y + h * 0.36)
        } else if (node.kind === 'summary') {
          const w = r * 1.5
          const h = r * 1.85
          ctx.fillStyle = tone
          roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(0,0,0,0.28)'
          ctx.fillRect(p.x - w / 2, p.y - h / 2, Math.max(2, w * 0.17), h)
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1
          ctx.globalAlpha *= 0.85
          for (const offset of [-0.25, 0, 0.25]) {
            ctx.beginPath()
            ctx.moveTo(p.x - w * 0.12, p.y + h * offset)
            ctx.lineTo(p.x + w * 0.3, p.y + h * offset)
            ctx.stroke()
          }
          ctx.globalAlpha = near && !near.has(node.id) ? 0.22 : 1
          if (ring) strokeRound(ctx, p.x - w / 2 - 2, p.y - h / 2 - 2, w + 4, h + 4, 3, ring)
        } else if (node.kind === 'note') {
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.fillStyle = isSelected || isFocus || isMatch ? colors.accent : colors.muted
          ctx.fill()
          ctx.lineWidth = 1.5
          ctx.strokeStyle = colors.canvas
          ctx.stroke()
        } else if (node.kind === 'missing') {
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.fillStyle = colors.canvas
          ctx.fill()
          ctx.setLineDash([2, 2])
          ctx.lineWidth = 1.2
          ctx.strokeStyle = ring ?? colors.muted
          ctx.stroke()
          ctx.setLineDash([])
        } else {
          const w = Math.max(r * 2.8, measure(ctx, node.label, camera.scale) + 12 * camera.scale)
          const h = r * 1.15
          ctx.fillStyle = colors.surface
          roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, h / 2)
          ctx.fill()
          ctx.lineWidth = 1
          ctx.strokeStyle = ring ?? colors.border
          ctx.stroke()
          ctx.fillStyle = colors.muted
          ctx.font = `${Math.max(9, 11 * camera.scale)}px system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(node.label, p.x, p.y)
        }
        // Подписи: книги и конспекты всегда, заметки — при крупном масштабе или в фокусе.
        const isLabelled = node.kind === 'book' || node.kind === 'summary' || showAllLabels || isFocus || isSelected || isMatch || Boolean(near?.has(node.id))
        if (node.kind !== 'tag' && isLabelled) {
          const below = node.kind === 'book' ? r * 1.05 + 6 : r + 5
          ctx.font = `${isSelected ? '600 ' : ''}${Math.max(10, Math.min(13, 11 * camera.scale))}px system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillStyle = isSelected || isFocus ? colors.text : colors.soft
          ctx.fillText(shorten(node.label), p.x, p.y + below)
        }
      }
      ctx.globalAlpha = 1
    }

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      const isFirst = !sizeRef.current.width
      sizeRef.current = { width: rect.width, height: rect.height }
      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      // Размер стал известен только сейчас: вписываем граф в окно (или сразу к выбранному узлу).
      if (isFirst && layoutRef.current) {
        cameraRef.current = fitCamera(layoutRef.current.nodes, sizeRef.current)
        if (pendingFocus.current && focusSelected.current(true)) pendingFocus.current = false
      }
      requestDraw.current()
    }
    resize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(container)
    // Смена темы меняет цвета: перерисовываем, палитру отрисовка перечитает сама.
    const themeObserver = new MutationObserver(() => requestDraw.current())
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })

    // Указатель: перетаскивание узла, сдвиг фона, наведение, клик и двойной клик.
    let drag: { kind: 'node' | 'pan'; id?: string; startX: number; startY: number; moved: boolean; camera: Camera } | null = null
    const local = (event: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }
    const hit = (x: number, y: number) => {
      const layout = layoutRef.current
      if (!layout) return null
      const world = toWorld(cameraRef.current, sizeRef.current, x, y)
      return nodeAt(layout.nodes, world.x, world.y, 6 / cameraRef.current.scale)
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const point = local(event)
      const node = hit(point.x, point.y)
      canvas.setPointerCapture?.(event.pointerId)
      cameraTarget.current = null
      drag = { kind: node ? 'node' : 'pan', id: node?.id, startX: point.x, startY: point.y, moved: false, camera: { ...cameraRef.current } }
    }
    const handlePointerMove = (event: PointerEvent) => {
      const point = local(event)
      if (!drag) {
        const id = hit(point.x, point.y)?.id ?? null
        if (id !== hoverRef.current) {
          hoverRef.current = id
          canvas.style.cursor = id ? 'pointer' : 'grab'
          requestDraw.current()
        }
        return
      }
      if (!drag.moved && Math.hypot(point.x - drag.startX, point.y - drag.startY) < CLICK_SLOP) return
      drag.moved = true
      if (drag.kind === 'node' && drag.id) {
        const world = toWorld(cameraRef.current, sizeRef.current, point.x, point.y)
        layoutRef.current?.hold(drag.id, world.x, world.y)
        layoutRef.current?.reheat(0.3)
      } else {
        canvas.style.cursor = 'grabbing'
        cameraRef.current = {
          ...drag.camera,
          x: drag.camera.x - (point.x - drag.startX) / drag.camera.scale,
          y: drag.camera.y - (point.y - drag.startY) / drag.camera.scale,
        }
      }
      requestDraw.current()
    }
    const handlePointerUp = () => {
      if (!drag) return
      if (drag.kind === 'node' && drag.id) layoutRef.current?.release(drag.id)
      if (!drag.moved) state.current.onSelect(drag.kind === 'node' ? drag.id ?? null : null)
      canvas.style.cursor = hoverRef.current ? 'pointer' : 'grab'
      drag = null
      requestDraw.current()
    }
    const handleDoubleClick = (event: MouseEvent) => {
      const point = local(event)
      const id = hit(point.x, point.y)?.id
      const node = id ? state.current.model.nodes.find((item) => item.id === id) : null
      if (node) state.current.onOpen(node)
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const point = local(event)
      cameraTarget.current = null
      cameraRef.current = zoomAt(cameraRef.current, sizeRef.current, point.x, point.y, Math.exp(-event.deltaY * 0.0015))
      requestDraw.current()
    }
    const handleLeave = () => {
      if (hoverRef.current) {
        hoverRef.current = null
        requestDraw.current()
      }
    }
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointercancel', handlePointerUp)
    canvas.addEventListener('pointerleave', handleLeave)
    canvas.addEventListener('dblclick', handleDoubleClick)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
      observer?.disconnect()
      themeObserver.disconnect()
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerUp)
      canvas.removeEventListener('pointerleave', handleLeave)
      canvas.removeEventListener('dblclick', handleDoubleClick)
      canvas.removeEventListener('wheel', handleWheel)
    }
  }, [])

  /** Клавиатура на холсте: стрелки сдвигают, +/− масштабируют, 0 вписывает граф, Esc снимает выбор. */
  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const camera = cameraRef.current
    const step = KEY_PAN / camera.scale
    const moves: Record<string, Camera> = {
      ArrowLeft: { ...camera, x: camera.x - step },
      ArrowRight: { ...camera, x: camera.x + step },
      ArrowUp: { ...camera, y: camera.y - step },
      ArrowDown: { ...camera, y: camera.y + step },
    }
    const { width, height } = sizeRef.current
    if (moves[event.key]) cameraRef.current = moves[event.key]
    else if (event.key === '+' || event.key === '=') cameraRef.current = zoomAt(camera, sizeRef.current, width / 2, height / 2, 1.25)
    else if (event.key === '-') cameraRef.current = zoomAt(camera, sizeRef.current, width / 2, height / 2, 0.8)
    else if (event.key === '0' && layoutRef.current) cameraRef.current = fitCamera(layoutRef.current.nodes, sizeRef.current)
    else if (event.key === 'Escape' && selectedId) onSelect(null)
    else return
    event.preventDefault()
    requestDraw.current()
  }

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label} tabIndex={0} onKeyDown={handleKeyDown} />
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

function strokeRound(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, color: string) {
  roundRect(ctx, x, y, width, height, radius)
  ctx.lineWidth = 2
  ctx.strokeStyle = color
  ctx.stroke()
}

function measure(ctx: CanvasRenderingContext2D, text: string, scale: number) {
  ctx.font = `${Math.max(9, 11 * scale)}px system-ui, sans-serif`
  return ctx.measureText(text).width
}

function shorten(label: string) {
  return label.length > 28 ? `${label.slice(0, 27)}…` : label
}
