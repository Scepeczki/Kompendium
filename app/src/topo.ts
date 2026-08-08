import type { PathEdge, PathNode } from './types'

/** Porządek topologiczny wg strzałek. Gałęzie z tego samego kafelka idą wg
 *  jawnego priorytetu strzałki (numerek na mapie), a bez niego wg pozycji celu.
 *  Pozostałe remisy rozstrzyga pozycja (y, potem x); cykle trafiają na koniec. */
export function topoOrder(nodes: PathNode[], edges: PathEdge[]): PathNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const indeg = new Map(nodes.map((n) => [n.id, 0]))
  const pos = (id: string) => byId.get(id) ?? { x: 0, y: 0 }

  // strzałki pogrupowane wg źródła, w efektywnej kolejności gałęzi
  const bySource = new Map<string, PathEdge[]>()
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue
    bySource.set(e.from, [...(bySource.get(e.from) ?? []), e])
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }
  for (const list of bySource.values()) {
    list.sort((a, b) => {
      const pa = a.priority ?? Infinity
      const pb = b.priority ?? Infinity
      if (pa !== pb) return pa - pb
      const ta = pos(a.to)
      const tb = pos(b.to)
      return ta.y - tb.y || ta.x - tb.x
    })
  }

  // Kahn: gotowe węzły wybieramy wg [moment uwolnienia, priorytet gałęzi, y, x]
  type Ready = { id: string; rank: [number, number] }
  const ready: Ready[] = nodes
    .filter((n) => (indeg.get(n.id) ?? 0) === 0)
    .map((n) => ({ id: n.id, rank: [0, 0] }))
  const result: PathNode[] = []
  const done = new Set<string>()
  let emitIdx = 0
  while (ready.length) {
    ready.sort((a, b) => {
      if (a.rank[0] !== b.rank[0]) return a.rank[0] - b.rank[0]
      if (a.rank[1] !== b.rank[1]) return a.rank[1] - b.rank[1]
      const na = pos(a.id)
      const nb = pos(b.id)
      return na.y - nb.y || na.x - nb.x
    })
    const { id } = ready.shift()!
    if (done.has(id)) continue
    done.add(id)
    emitIdx++
    result.push(byId.get(id)!)
    const out = bySource.get(id) ?? []
    out.forEach((e, branchIdx) => {
      indeg.set(e.to, (indeg.get(e.to) ?? 0) - 1)
      if ((indeg.get(e.to) ?? 0) <= 0 && !done.has(e.to)) {
        ready.push({ id: e.to, rank: [emitIdx, branchIdx] })
      }
    })
  }
  // Reszta: węzły uwięzione w cyklu. Dawniej lądowały hurtem na końcu, przez
  // co po jednej wadliwej strzałce pół ścieżki zjeżdżało na dół i wyglądało
  // na zgubione. Teraz przepuszczamy je przez to samo sito, tylko z rozcięciem
  // cyklu: bierzemy ten węzeł, do którego prowadzi najmniej strzałek, i tak
  // w kółko. Kolejność zostaje sensowna, a nic nie wypada z widoku.
  const rest = nodes.filter((n) => !done.has(n.id))
  while (rest.length) {
    rest.sort((a, b) => {
      const da = indeg.get(a.id) ?? 0
      const db = indeg.get(b.id) ?? 0
      if (da !== db) return da - db
      return a.y - b.y || a.x - b.x
    })
    const n = rest.shift()!
    done.add(n.id)
    result.push(n)
    for (const e of bySource.get(n.id) ?? []) {
      indeg.set(e.to, (indeg.get(e.to) ?? 0) - 1)
    }
  }
  return result
}
