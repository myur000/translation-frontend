import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { coverInitial } from '../../documents/bookTitle.ts'
import { ForceLayout } from '../../graph/forceLayout.ts'
import { GRAPH_GROUP_TONES, matchesGraphQuery, neighbours, type GraphModel, type GraphNode } from '../../graph/graphModel.ts'
import { fitCamera, linkDistance, nodeAt, nodeRadius, stepTowards, toScreen, toWorld, zoomAt, type Camera } from '../../graph/graphView.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './GraphCanvas.module.css'

interface GraphCanvasProps {
  /** Видимая часть графа (после фильтров). */
  model: GraphModel
  selectedId: string | null
  /** Поиск: совпавшие узлы обведены акцентом. */
  query: string
  /** Раскраска: тон узла (`--graph-group-N`), у кого он есть. */
  tones?: ReadonlyMap<string, number>
  /** Растёт, когда камере нужно подлететь к выбранному узлу (выбор в панели, в списке связей). */
  focusNonce: number
  label: string
  /** `follow` — камера подлетает к узлу (выбор стрелками с клавиатуры). */
  onSelect: (id: string | null, follow?: boolean) => void
  onOpen: (node: GraphNode) => void
}

interface Palette {
  accent: string
  /** Связи выбранного узла — светлее акцента, чтобы линия читалась. */
  hot: string
  text: string
  muted: string
  soft: string
  border: string
  surface: string
  canvas: string
  dot: string
  edge: string
  note: string
  font: string
  covers: string[]
  groups: string[]
}

/** Сдвиг больше этого — перетаскивание, а не клик. */
const CLICK_SLOP = 4
/** С какого масштаба подписываются все заметки (книги и конспекты — всегда). */
const LABEL_SCALE = 0.8
/** Граф до стольких узлов подписан целиком при любом масштабе. */
const SMALL_GRAPH = 30
/** Шаг точечной сетки в координатах мира. */
const GRID_STEP = 26
const KEY_PAN = 60
const NO_TONES: ReadonlyMap<string, number> = new Map()
const ZOOM_STEP = 1.3

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element)
  const value = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    accent: value('--color-accent', '#e8833a'),
    hot: value('--color-accent-highlight-line', '#f28c3a'),
    text: value('--color-text', '#e6edf5'),
    muted: value('--color-text-muted', '#9fb1c6'),
    soft: value('--color-text-soft', '#7c90a8'),
    border: value('--color-border', '#2a3b55'),
    surface: value('--color-surface', '#16233a'),
    canvas: value('--graph-bg', '#111d30'),
    dot: value('--graph-dot', 'rgba(143,177,201,0.12)'),
    edge: value('--graph-edge', '#3c5a76'),
    note: value('--graph-note', '#8fb1c9'),
    font: value('--font-sans', 'system-ui, sans-serif'),
    covers: Array.from({ length: 6 }, (_, index) => value(`--cover-${index}`, '#7a5a2e')),
    groups: Array.from({ length: GRAPH_GROUP_TONES }, (_, index) => value(`--graph-group-${index}`, '#8fb1c9')),
  }
}

/**
 * Холст графа: живая силовая раскладка, перетаскивание узлов, сдвиг фона, масштаб
 * колёсиком (вокруг курсора). Наведение подсвечивает узел и его соседей, клик
 * выбирает, двойной клик открывает. Рисуется на canvas — тысячи узлов не нагружают
 * DOM; для клавиатуры и скринридера рядом есть обычный список узлов (`GraphPage`).
 */
export function GraphCanvas({ model, selectedId, query, tones = NO_TONES, focusNonce, label, onSelect, onOpen }: GraphCanvasProps) {
  const { t } = useTranslation()
  const hintId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef<ForceLayout | null>(null)
  const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: 1 })
  const cameraTarget = useRef<Camera | null>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const hoverRef = useRef<string | null>(null)
  const frameRef = useRef(0)
  // Свежие значения для цикла отрисовки: он живёт дольше одного рендера.
  const state = useRef({ model, selectedId, query, tones, onSelect, onOpen })
  useEffect(() => { state.current = { model, selectedId, query, tones, onSelect, onOpen } })

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

  useEffect(() => { requestDraw.current() }, [selectedId, query, tones])

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
      const { model: current, selectedId: selected, query: search, tones: groupTones } = state.current
      const camera = cameraRef.current
      const focus = hoverRef.current ?? selected
      const near = focus ? neighbours(current.links, focus) : null
      const nodesById = new Map(current.nodes.map((node) => [node.id, node]))
      const lineScale = Math.min(1.6, Math.max(0.6, camera.scale))

      ctx.fillStyle = colors.canvas
      ctx.fillRect(0, 0, width, height)
      // Сетка едет вместе с картой: видно, что её можно тянуть.
      const step = GRID_STEP * camera.scale
      if (step > 11) {
        const origin = toScreen(camera, sizeRef.current, { x: 0, y: 0 })
        ctx.fillStyle = colors.dot
        for (let x = ((origin.x % step) + step) % step; x < width; x += step) {
          for (let y = ((origin.y % step) + step) % step; y < height; y += step) {
            ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5)
          }
        }
      }

      // Связи.
      for (const link of current.links) {
        const source = layout.node(link.source)
        const target = layout.node(link.target)
        if (!source || !target) continue
        const a = toScreen(camera, sizeRef.current, source)
        const b = toScreen(camera, sizeRef.current, target)
        const isHot = Boolean(focus && (link.source === focus || link.target === focus))
        const summary = link.kind === 'about' ? nodesById.get(link.source) : null
        const color = isHot
          ? (summary?.tone !== null && summary?.tone !== undefined ? colors.covers[summary.tone] : colors.hot)
          : colors.edge
        const base = link.kind === 'quotes' ? 1.2 + Math.min(3, (link.weight - 1) * 0.8)
          : link.kind === 'about' ? 1.4
            : link.kind === 'tagged' ? 0.9 : 1
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.setLineDash(link.kind === 'about' ? [5, 4] : link.kind === 'tagged' ? [1.5, 3.5] : [])
        ctx.globalAlpha = near ? (isHot ? 1 : 0.1) : 0.9
        ctx.strokeStyle = color
        ctx.lineWidth = (isHot ? base + 0.6 : base) * lineScale
        ctx.stroke()
        // Стрелка у цели [[ссылки]]: видно, кто на кого ссылается.
        if (link.kind === 'links' && (isHot || camera.scale > 1.3)) {
          const angle = Math.atan2(b.y - a.y, b.x - a.x)
          const back = target.radius * camera.scale + 3
          const tipX = b.x - Math.cos(angle) * back
          const tipY = b.y - Math.sin(angle) * back
          const size = 7 * lineScale
          ctx.setLineDash([])
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.moveTo(tipX, tipY)
          ctx.lineTo(tipX - Math.cos(angle - 0.45) * size, tipY - Math.sin(angle - 0.45) * size)
          ctx.lineTo(tipX - Math.cos(angle + 0.45) * size, tipY - Math.sin(angle + 0.45) * size)
          ctx.closePath()
          ctx.fill()
        }
      }
      ctx.setLineDash([])

      // Узлы.
      const showAllLabels = camera.scale >= LABEL_SCALE || current.nodes.length <= SMALL_GRAPH
      const labels: { text: string; x: number; y: number; weight: number; color: string; alpha: number }[] = []
      for (const node of current.nodes) {
        const place = layout.node(node.id)
        if (!place) continue
        const p = toScreen(camera, sizeRef.current, place)
        const r = place.radius * camera.scale
        if (p.x < -60 || p.y < -60 || p.x > width + 60 || p.y > height + 60) continue
        const isFocus = node.id === focus
        const isSelected = node.id === selected
        const isMatch = matchesGraphQuery(node.label, search)
        const isDim = Boolean(near && !near.has(node.id)) || Boolean(!near && search && !isMatch)
        ctx.globalAlpha = isDim ? 0.2 : 1
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
          if (ring) strokeRound(ctx, p.x - w / 2 - 4, p.y - h / 2 - 4, w + 8, h + 8, 6, ring)
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
          ctx.globalAlpha = isDim ? 0.2 : 1
          if (ring) strokeRound(ctx, p.x - w / 2 - 3, p.y - h / 2 - 3, w + 6, h + 6, 4, ring)
        } else if (node.kind === 'note') {
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          const group = groupTones.get(node.id)
          ctx.fillStyle = isSelected || isFocus ? colors.accent : group !== undefined ? colors.groups[group] : colors.note
          ctx.fill()
          if (isSelected || isMatch) strokeCircle(ctx, p.x, p.y, r + 4, colors.accent)
        } else if (node.kind === 'missing') {
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.fillStyle = colors.canvas
          ctx.fill()
          ctx.setLineDash([2.5, 2.5])
          ctx.lineWidth = 1.4
          ctx.strokeStyle = colors.soft
          ctx.stroke()
          ctx.setLineDash([])
          if (ring) strokeCircle(ctx, p.x, p.y, r + 4, ring)
        } else {
          const w = Math.max(r * 2.8, measure(ctx, node.label, camera.scale) + 12 * camera.scale)
          const h = r * 1.15
          ctx.fillStyle = colors.surface
          roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, h / 2)
          ctx.fill()
          const group = groupTones.get(node.id)
          ctx.lineWidth = group !== undefined ? 2 : 1
          ctx.strokeStyle = ring ?? (group !== undefined ? colors.groups[group] : colors.border)
          ctx.stroke()
          ctx.fillStyle = colors.muted
          ctx.font = `${Math.max(9, 11 * camera.scale)}px ${colors.font}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(node.label, p.x, p.y)
        }
        // Подписи: книги и конспекты всегда, заметки — при крупном масштабе, в маленьком графе или в фокусе.
        const isLabelled = node.kind === 'book' || node.kind === 'summary' || showAllLabels || isFocus || isSelected || isMatch || Boolean(near?.has(node.id))
        if (node.kind !== 'tag' && isLabelled) {
          const isBook = node.kind === 'book'
          labels.push({
            text: shorten(node.label),
            x: p.x,
            y: p.y + (isBook ? r * 1.05 + 7 : r + 5),
            weight: isBook || isSelected ? 600 : 400,
            color: node.kind === 'missing' ? colors.muted : colors.text,
            alpha: isDim ? 0.25 : 1,
          })
        }
      }

      // Подписи поверх линий, с подложкой цвета фона.
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 3.5
      ctx.strokeStyle = colors.canvas
      for (const label of labels) {
        ctx.globalAlpha = label.alpha
        ctx.font = `${label.weight} 12px ${colors.font}`
        ctx.strokeText(label.text, label.x, label.y)
        ctx.fillStyle = label.color
        ctx.fillText(label.text, label.x, label.y)
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

  const zoomBy = (factor: number) => {
    const { width, height } = sizeRef.current
    cameraTarget.current = zoomAt(cameraTarget.current ?? cameraRef.current, sizeRef.current, width / 2, height / 2, factor)
    requestDraw.current()
  }
  const fit = () => {
    if (!layoutRef.current) return
    cameraTarget.current = fitCamera(layoutRef.current.nodes, sizeRef.current)
    requestDraw.current()
  }

  /**
   * Клавиатура на холсте: стрелки — к соседнему узлу в эту сторону, Shift со стрелками —
   * сдвиг карты, Enter открывает, +/− масштабируют, 0 вписывает граф, Esc снимает выбор.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const camera = cameraRef.current
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const direction = directions[event.key]
    const layout = layoutRef.current
    if (direction && event.shiftKey) {
      const step = KEY_PAN / camera.scale
      cameraRef.current = { ...camera, x: camera.x + direction[0] * step, y: camera.y + direction[1] * step }
    } else if (direction && layout) {
      const current = selectedId ? layout.node(selectedId) : null
      const next = current
        ? stepTowards(current, direction[0], direction[1], neighbours(model.links, current.id), layout.nodes)
        : [...model.nodes].sort((a, b) => b.degree - a.degree)[0]
      if (next) onSelect(next.id, true)
    } else if (event.key === 'Enter' && selectedId) {
      const node = model.nodes.find((item) => item.id === selectedId)
      if (node) onOpen(node)
    } else if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP)
    else if (event.key === '-') zoomBy(1 / ZOOM_STEP)
    else if (event.key === '0') fit()
    else if (event.key === 'Escape' && selectedId) onSelect(null)
    else return
    event.preventDefault()
    requestDraw.current()
  }

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label} aria-describedby={hintId}
        tabIndex={0} onKeyDown={handleKeyDown} />
      <p id={hintId} className={styles.visuallyHidden}>{t('graph.hint')}</p>
      <div className={styles.zoom} role="group" aria-label={t('graph.zoomControls')}>
        <button type="button" aria-label={t('graph.zoomIn')} title={t('graph.zoomIn')} onClick={() => zoomBy(ZOOM_STEP)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" /></svg>
        </button>
        <button type="button" aria-label={t('graph.zoomOut')} title={t('graph.zoomOut')} onClick={() => zoomBy(1 / ZOOM_STEP)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg>
        </button>
        <button type="button" aria-label={t('graph.fit')} title={t('graph.fit')} onClick={fit}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" /></svg>
        </button>
      </div>
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

function strokeCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
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
