import { describe, expect, it } from 'vitest'
import type { NoteGraphResponse } from '../api/contracts/notes.ts'
import { ForceLayout } from '../graph/forceLayout.ts'
import { buildGraphModel, filterGraph, matchesGraphQuery, neighbours, nodeRelations, splitLonely } from '../graph/graphModel.ts'
import { graphSearch, readGraphQuery } from '../graph/graphQuery.ts'
import { fitCamera, linkDistance, nodeAt, nodeRadius, stepTowards, toScreen, toWorld, zoomAt } from '../graph/graphView.ts'

const response: NoteGraphResponse = {
  nodes: [
    { id: 'document:j1', type: 'document', label: 'lighthouse-keepers-ledger.docx', ref: 'j1', deleted: false },
    { id: 'document:j2', type: 'document', label: 'salt_and_iron.pdf', ref: null, deleted: true },
    { id: 'note:s1', type: 'note', label: 'Конспект', ref: 's1', deleted: false },
    { id: 'note:n1', type: 'note', label: 'Шторм', ref: 'n1', deleted: false },
    { id: 'note:n2', type: 'note', label: 'Ветер', ref: 'n2', deleted: false },
    { id: 'note:n3', type: 'note', label: 'Идеи', ref: 'n3', deleted: false },
    { id: 'tag:сюжет', type: 'tag', label: '#сюжет', ref: null, deleted: false },
    { id: 'missing:огонь', type: 'missing', label: 'Огонь за рифом', ref: null, deleted: false },
    { id: 'term:t1', type: 'term', label: 'маяк', ref: 't1', deleted: false },
  ],
  edges: [
    { source: 'note:s1', target: 'document:j1', type: 'about', weight: 1 },
    { source: 'note:n1', target: 'document:j1', type: 'quotes', weight: 3 },
    { source: 'note:n2', target: 'document:j2', type: 'quotes', weight: 1 },
    { source: 'note:n1', target: 'note:n2', type: 'links', weight: 1 },
    { source: 'note:n1', target: 'missing:огонь', type: 'links', weight: 1 },
    { source: 'note:n1', target: 'tag:сюжет', type: 'tagged', weight: 1 },
    { source: 'term:t1', target: 'document:j1', type: 'appears_in', weight: 1 },
  ],
  truncated: false,
}

describe('graph model', () => {
  it('turns notes linked to a whole book into summaries with the tone of that book', () => {
    const model = buildGraphModel(response)
    const kinds = Object.fromEntries(model.nodes.map((node) => [node.id, node.kind]))
    expect(kinds).toEqual({
      'document:j1': 'book', 'document:j2': 'book', 'note:s1': 'summary', 'note:n1': 'note', 'note:n2': 'note',
      'note:n3': 'note', 'tag:сюжет': 'tag', 'missing:огонь': 'missing',
    })
    const book = model.nodes.find((node) => node.id === 'document:j1')!
    const summary = model.nodes.find((node) => node.id === 'note:s1')!
    expect(book.label).toBe('Lighthouse keepers ledger')
    expect(summary.tone).toBe(book.tone)
    // Термины ждут глоссария: ни узла, ни связи.
    expect(model.links.some((link) => link.source === 'term:t1')).toBe(false)
    expect(model.nodes.find((node) => node.id === 'note:n1')!.degree).toBe(4)
  })

  it('hides kinds by filters together with their links, and lonely notes on request', () => {
    const model = buildGraphModel(response)
    const visible = filterGraph(model, new Set(['tag', 'missing', 'lonely']))
    expect(visible.nodes.map((node) => node.id)).not.toContain('tag:сюжет')
    expect(visible.nodes.map((node) => node.id)).not.toContain('note:n3')
    expect(visible.links.every((link) => !link.target.startsWith('tag:') && !link.target.startsWith('missing:'))).toBe(true)
    expect([...neighbours(visible.links, 'note:n1')].sort()).toEqual(['document:j1', 'note:n1', 'note:n2'])
    expect(matchesGraphQuery('Шторм на мысе', 'шторм')).toBe(true)
    expect(matchesGraphQuery('Ёлка', 'елк')).toBe(true)
    expect(matchesGraphQuery('Ветер', '')).toBe(false)
  })
})

describe('force layout', () => {
  const layoutOf = () => {
    const model = buildGraphModel(response)
    const layout = new ForceLayout(
      model.nodes.map((node) => ({ id: node.id, radius: nodeRadius(node) })),
      model.links.map((link) => ({ source: link.source, target: link.target, distance: linkDistance(link.kind) })),
    )
    layout.settle()
    return layout
  }

  it('settles into a readable picture: finite, linked nodes close, no overlaps', () => {
    const layout = layoutOf()
    expect(layout.isSettled).toBe(true)
    for (const node of layout.nodes) {
      expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true)
      for (const other of layout.nodes) {
        if (other.id <= node.id) continue
        expect(Math.hypot(node.x - other.x, node.y - other.y)).toBeGreaterThan((node.radius + other.radius) * 0.9)
      }
    }
    const at = (id: string) => layout.node(id)!
    const distance = (a: string, b: string) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y)
    // Конспект держится у своей книги ближе, чем несвязанная заметка.
    expect(distance('note:s1', 'document:j1')).toBeLessThan(distance('note:n3', 'document:j1'))
  })

  it('is deterministic and keeps known places after a filter change', () => {
    const first = layoutOf().positions()
    expect(layoutOf().positions()).toEqual(first)
    const again = new ForceLayout([{ id: 'note:n1', radius: 8 }], [], first)
    expect(again.node('note:n1')).toMatchObject(first.get('note:n1')!)
    // Всё уже на местах — раскладка почти не разогревается.
    expect(again.alpha).toBeLessThan(0.1)
  })

  it('keeps a held node where the pointer is', () => {
    const layout = layoutOf()
    layout.hold('note:n1', 500, -300)
    layout.reheat()
    for (let step = 0; step < 20; step += 1) layout.tick()
    expect(layout.node('note:n1')).toMatchObject({ x: 500, y: -300 })
  })
})

describe('graph camera', () => {
  const size = { width: 800, height: 600 }

  it('maps world to screen and back, and zooms around the pointer', () => {
    const camera = { x: 100, y: 50, scale: 2 }
    const point = toScreen(camera, size, { x: 120, y: 60 })
    expect(point).toEqual({ x: 440, y: 320 })
    expect(toWorld(camera, size, point.x, point.y)).toEqual({ x: 120, y: 60 })
    const zoomed = zoomAt(camera, size, 440, 320, 1.5)
    expect(zoomed.scale).toBe(3)
    // Точка под курсором осталась под ним.
    expect(toScreen(zoomed, size, { x: 120, y: 60 })).toEqual({ x: 440, y: 320 })
    expect(zoomAt(camera, size, 0, 0, 100).scale).toBe(4)
  })

  it('fits the graph into the canvas without blowing up a small one, and finds the node under the pointer', () => {
    const fitted = fitCamera([{ x: -100, y: 0, radius: 10 }, { x: 300, y: 200, radius: 10 }], size)
    expect(fitted.x).toBe(100)
    expect(fitted.y).toBe(100)
    expect(fitted.scale).toBeCloseTo(Math.min(704 / 420, 504 / 220, 1.4))
    expect(fitCamera([{ x: 0, y: 0, radius: 5 }], size).scale).toBe(1.4)
    const nodes = [{ id: 'a', x: 0, y: 0, radius: 6 }, { id: 'b', x: 30, y: 0, radius: 20 }]
    expect(nodeAt(nodes, 8, 0)?.id).toBe('a')
    expect(nodeAt(nodes, 200, 200)).toBeNull()
  })
})

describe('graph address', () => {
  it('keeps filters, the selected node and the search in the address in a stable order', () => {
    const query = { hidden: new Set(['missing', 'tag'] as const), node: 'note:n1', q: ' шторм ' }
    expect(graphSearch(query)).toBe('?hide=tag%2Cmissing&node=note%3An1&q=%D1%88%D1%82%D0%BE%D1%80%D0%BC')
    expect(readGraphQuery(graphSearch(query))).toEqual({ hidden: new Set(['tag', 'missing']), node: 'note:n1', q: 'шторм' })
    expect(readGraphQuery('?hide=tag,bogus')).toEqual({ hidden: new Set(['tag']), node: null, q: '' })
    expect(graphSearch({ hidden: new Set(), node: null, q: '' })).toBe('')
  })
})

describe('graph map helpers', () => {
  it('moves notes without visible links out of the layout', () => {
    const model = buildGraphModel(response)
    const { connected, lonely } = splitLonely(model)
    expect(lonely.map((node) => node.id)).toEqual(['note:n3'])
    expect(connected.nodes.map((node) => node.id)).not.toContain('note:n3')
    expect(connected.links).toEqual(model.links)
    // Связь только с тегом: тег спрятан — заметка уходит в «без связей».
    const withoutTags = splitLonely(filterGraph(buildGraphModel({
      ...response,
      edges: [{ source: 'note:n3', target: 'tag:сюжет', type: 'tagged', weight: 1 }],
    }), new Set(['tag'])))
    expect(withoutTags.lonely.map((node) => node.id)).toContain('note:n3')
  })

  it('groups a node’s links by meaning for its card', () => {
    const model = buildGraphModel(response)
    expect(nodeRelations(model.links, 'note:n1')).toEqual({
      quotes: [{ id: 'document:j1', weight: 3 }],
      about: [],
      linksOut: ['note:n2', 'missing:огонь'],
      linksIn: [],
      tags: ['tag:сюжет'],
      summaries: [],
      quotedBy: [],
      tagged: [],
    })
    const book = nodeRelations(model.links, 'document:j1')
    expect(book.summaries).toEqual(['note:s1'])
    expect(book.quotedBy).toEqual([{ id: 'note:n1', weight: 3 }])
    expect(nodeRelations(model.links, 'note:n2').linksIn).toEqual(['note:n1'])
    expect(nodeRelations(model.links, 'tag:сюжет').tagged).toEqual(['note:n1'])
  })

  it('steps to the nearest node in the arrow’s direction, neighbours first', () => {
    const nodes = [
      { id: 'a', x: 0, y: 0 },
      { id: 'near', x: 40, y: 5 },
      { id: 'linked', x: 120, y: -20 },
      { id: 'above', x: 0, y: -50 },
    ]
    expect(stepTowards(nodes[0], 1, 0, new Set(['linked']), nodes)?.id).toBe('linked')
    expect(stepTowards(nodes[0], 1, 0, new Set(), nodes)?.id).toBe('near')
    expect(stepTowards(nodes[0], 0, -1, new Set(), nodes)?.id).toBe('above')
    expect(stepTowards(nodes[0], -1, 0, new Set(), nodes)).toBeNull()
  })
})
