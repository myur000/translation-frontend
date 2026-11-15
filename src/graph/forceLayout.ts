/**
 * Силовая раскладка графа: пружины по связям, отталкивание узлов, без столкновений
 * и мягкое притяжение к центру. По устройству — как d3-force (скорости, затухание
 * «температуры» alpha), но без зависимости: для наших сотен — тысяч узлов хватает
 * отталкивания с отсечкой по сетке. Шаг считается без отрисовки — её делает холст.
 */

export interface LayoutInputNode {
  id: string
  /** Радиус узла на экране при масштабе 1: узлы не налезают друг на друга. */
  radius: number
}

export interface LayoutInputLink {
  source: string
  target: string
  /** Желаемая длина связи (от центра до центра). */
  distance: number
}

export interface LayoutNode {
  id: string
  radius: number
  x: number
  y: number
  vx: number
  vy: number
  /** Узел держат мышью: он стоит там, где курсор, и тянет за собой соседей. */
  fixed: boolean
}

export interface LayoutOptions {
  /** Сила отталкивания: чем больше, тем просторнее граф. */
  repulsion?: number
  /** Дальше этого расстояния узлы друг друга не отталкивают. */
  cutoff?: number
  /** Притяжение к центру: одиночные заметки не уплывают за край. */
  gravity?: number
}

const ALPHA_MIN = 0.002
/** За ~300 шагов alpha падает с 1 до ALPHA_MIN — как в d3-force. */
const ALPHA_DECAY = 1 - Math.pow(ALPHA_MIN, 1 / 300)
const VELOCITY_DECAY = 0.4
const COLLIDE_PADDING = 6

export class ForceLayout {
  readonly nodes: LayoutNode[]
  private readonly byId: Map<string, LayoutNode>
  private readonly links: { source: LayoutNode; target: LayoutNode; distance: number; strength: number; bias: number }[]
  private readonly repulsion: number
  private readonly cutoff: number
  private readonly gravity: number
  alpha = 1

  /**
   * `previous` — места узлов с прошлой раскладки: после смены фильтра граф не
   * перестраивается с нуля, оставшиеся узлы стоят где стояли.
   */
  constructor(
    nodes: readonly LayoutInputNode[],
    links: readonly LayoutInputLink[],
    previous?: ReadonlyMap<string, { x: number; y: number }>,
    options: LayoutOptions = {},
  ) {
    this.repulsion = options.repulsion ?? 1400
    this.cutoff = options.cutoff ?? 420
    this.gravity = options.gravity ?? 0.05
    this.nodes = nodes.map((node, index) => {
      const known = previous?.get(node.id)
      // Новые узлы — по спирали «подсолнуха», как в d3: равномерно и без случайности,
      // поэтому одна и та же база заметок раскладывается одинаково.
      const radius = 18 * Math.sqrt(0.5 + index)
      const angle = index * Math.PI * (3 - Math.sqrt(5))
      return {
        id: node.id,
        radius: node.radius,
        x: known?.x ?? radius * Math.cos(angle),
        y: known?.y ?? radius * Math.sin(angle),
        vx: 0,
        vy: 0,
        fixed: false,
      }
    })
    this.byId = new Map(this.nodes.map((node) => [node.id, node]))
    const count = new Map<string, number>()
    for (const link of links) {
      count.set(link.source, (count.get(link.source) ?? 0) + 1)
      count.set(link.target, (count.get(link.target) ?? 0) + 1)
    }
    this.links = links.flatMap((link) => {
      const source = this.byId.get(link.source)
      const target = this.byId.get(link.target)
      if (!source || !target || source === target) return []
      const sourceCount = count.get(link.source) ?? 1
      const targetCount = count.get(link.target) ?? 1
      // Как в d3: связь узла с многими соседями слабее, а сдвигается сильнее «лёгкий» конец.
      return [{
        source,
        target,
        distance: link.distance,
        strength: 1 / Math.min(sourceCount, targetCount),
        bias: sourceCount / (sourceCount + targetCount),
      }]
    })
    // Граф, который пришёл почти готовым (все узлы известны), не разогреваем заново.
    if (previous && this.nodes.every((node) => previous.has(node.id))) this.alpha = 0.05
  }

  get isSettled() {
    return this.alpha < ALPHA_MIN
  }

  /** Разогреть раскладку (перетаскивание, новые узлы): граф снова подстроится. */
  reheat(alpha = 0.3) {
    this.alpha = Math.max(this.alpha, alpha)
  }

  node(id: string) {
    return this.byId.get(id)
  }

  /** Держать узел в точке (перетаскивание мышью). */
  hold(id: string, x: number, y: number) {
    const node = this.byId.get(id)
    if (!node) return
    node.fixed = true
    node.x = x
    node.y = y
    node.vx = 0
    node.vy = 0
  }

  release(id: string) {
    const node = this.byId.get(id)
    if (node) node.fixed = false
  }

  positions(): Map<string, { x: number; y: number }> {
    return new Map(this.nodes.map((node) => [node.id, { x: node.x, y: node.y }]))
  }

  /** Один шаг раскладки. */
  tick() {
    const alpha = this.alpha
    this.applyLinks(alpha)
    this.applyRepulsion(alpha)
    for (const node of this.nodes) {
      node.vx -= node.x * this.gravity * alpha
      node.vy -= node.y * this.gravity * alpha
    }
    for (const node of this.nodes) {
      if (node.fixed) {
        node.vx = 0
        node.vy = 0
        continue
      }
      node.vx *= 1 - VELOCITY_DECAY
      node.vy *= 1 - VELOCITY_DECAY
      node.x += node.vx
      node.y += node.vy
    }
    this.applyCollisions()
    this.alpha += (0 - this.alpha) * ALPHA_DECAY
  }

  /** Прогнать раскладку до покоя (или до предела шагов) — для тестов и первого кадра. */
  settle(maxTicks = 400) {
    for (let step = 0; step < maxTicks && !this.isSettled; step += 1) this.tick()
  }

  private applyLinks(alpha: number) {
    for (const link of this.links) {
      let dx = link.target.x + link.target.vx - link.source.x - link.source.vx
      let dy = link.target.y + link.target.vy - link.source.y - link.source.vy
      // Узлы в одной точке: разводим на крошечный детерминированный сдвиг.
      if (!dx && !dy) dx = 0.01
      const length = Math.hypot(dx, dy)
      const pull = ((length - link.distance) / length) * alpha * link.strength
      dx *= pull
      dy *= pull
      link.target.vx -= dx * link.bias
      link.target.vy -= dy * link.bias
      link.source.vx += dx * (1 - link.bias)
      link.source.vy += dy * (1 - link.bias)
    }
  }

  /** Отталкивание с отсечкой: узлы раскладываются по сетке, сравниваются только соседние клетки. */
  private applyRepulsion(alpha: number) {
    const cell = this.cutoff
    const grid = new Map<string, LayoutNode[]>()
    const key = (x: number, y: number) => `${Math.floor(x / cell)}:${Math.floor(y / cell)}`
    for (const node of this.nodes) {
      const bucket = grid.get(key(node.x, node.y))
      if (bucket) bucket.push(node)
      else grid.set(key(node.x, node.y), [node])
    }
    const cutoff2 = this.cutoff * this.cutoff
    for (const node of this.nodes) {
      const cx = Math.floor(node.x / cell)
      const cy = Math.floor(node.y / cell)
      for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
        for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
          for (const other of grid.get(`${gx}:${gy}`) ?? []) {
            if (other === node) continue
            let dx = node.x - other.x
            let dy = node.y - other.y
            if (!dx && !dy) {
              dx = node.id < other.id ? 0.01 : -0.01
              dy = 0
            }
            const distance2 = dx * dx + dy * dy
            if (distance2 > cutoff2) continue
            // Ближе радиусов — не бесконечность: столкновения разводит отдельный шаг.
            const force = (this.repulsion * alpha) / Math.max(distance2, 100)
            node.vx += dx * force
            node.vy += dy * force
          }
        }
      }
    }
  }

  /** Узлы не налезают друг на друга: пересекающиеся разводятся поровну. */
  private applyCollisions() {
    const cell = 80
    const grid = new Map<string, LayoutNode[]>()
    for (const node of this.nodes) {
      const id = `${Math.floor(node.x / cell)}:${Math.floor(node.y / cell)}`
      const bucket = grid.get(id)
      if (bucket) bucket.push(node)
      else grid.set(id, [node])
    }
    for (const node of this.nodes) {
      const cx = Math.floor(node.x / cell)
      const cy = Math.floor(node.y / cell)
      for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
        for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
          for (const other of grid.get(`${gx}:${gy}`) ?? []) {
            if (other.id <= node.id) continue
            const dx = other.x - node.x
            const dy = other.y - node.y
            const min = node.radius + other.radius + COLLIDE_PADDING
            const distance = Math.hypot(dx, dy) || 0.01
            if (distance >= min) continue
            const push = (min - distance) / distance / 2
            if (!node.fixed) {
              node.x -= dx * push
              node.y -= dy * push
            }
            if (!other.fixed) {
              other.x += dx * push
              other.y += dy * push
            }
          }
        }
      }
    }
  }
}
