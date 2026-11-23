import { db } from './db'
import { topoOrder } from './topo'
import type { PathEdge, PathNode } from './types'

/** Operacje na kolejności ścieżki wprost w bazie — dla ekranów, na których
 *  Linii nie ma (etap zadań w nauce). Robią to samo co Linia: łańcuch
 *  strzałek after → węzeł → before, a przy wyjęciu sąsiedzi się zszywają.
 *  Kafelek (pojęcie) nigdy nie jest tu usuwany — tylko jego miejsce w ścieżce. */

const nowaStrzalka = (from: string, to: string): PathEdge => ({ id: crypto.randomUUID(), from, to })

/** Wyjmuje węzeł z łańcucha i łączy jego poprzednika z następnikiem. */
function bezWezla(edges: PathEdge[], id: string): PathEdge[] {
  const wej = edges.filter((e) => e.to === id).map((e) => e.from)
  const wyj = edges.filter((e) => e.from === id).map((e) => e.to)
  let reszta = edges.filter((e) => e.from !== id && e.to !== id)
  if (wej.length === 1 && wyj.length === 1 && wej[0] !== wyj[0] && !reszta.some((e) => e.from === wej[0] && e.to === wyj[0])) {
    reszta = [...reszta, nowaStrzalka(wej[0], wyj[0])]
  }
  return reszta
}

/** Wstawia węzeł w łańcuch: after → id → before (rozcina strzałkę after→before). */
function wLancuch(edges: PathEdge[], id: string, afterId: string | null, beforeId: string | null): PathEdge[] {
  let reszta = edges
  if (afterId && beforeId) reszta = reszta.filter((e) => !(e.from === afterId && e.to === beforeId))
  const dodaj: PathEdge[] = []
  if (afterId) dodaj.push(nowaStrzalka(afterId, id))
  if (beforeId) dodaj.push(nowaStrzalka(id, beforeId))
  return [...reszta, ...dodaj]
}

/** Miejsce na mapie między dwoma węzłami (jak w Linii). */
function miejsce(nodes: PathNode[], afterId: string | null, beforeId: string | null) {
  const a = nodes.find((n) => n.id === afterId)
  const b = nodes.find((n) => n.id === beforeId)
  if (a && b) return { x: a.x, y: (a.y + b.y) / 2 }
  if (a) return { x: a.x, y: a.y + 160 }
  if (b) return { x: b.x, y: b.y - 160 }
  return { x: 120, y: 80 }
}

/** Kolejność ścieżki (bez komentarzy — stoją z boku). */
export async function kolejnoscSciezki(pathId: string): Promise<PathNode[]> {
  const p = await db.paths.get(pathId)
  return p ? topoOrder(p.nodes, p.edges) : []
}

/** Przesuwa istniejący węzeł między afterId a beforeId. */
export async function przesunWezel(pathId: string, nodeId: string, afterId: string | null, beforeId: string | null) {
  if (nodeId === afterId || nodeId === beforeId) return
  await db.transaction('rw', db.paths, async () => {
    const p = await db.paths.get(pathId)
    if (!p || !p.nodes.some((n) => n.id === nodeId)) return
    const edges = wLancuch(bezWezla(p.edges, nodeId), nodeId, afterId, beforeId)
    const gdzie = miejsce(p.nodes, afterId, beforeId)
    const nodes = p.nodes.map((n) => (n.id === nodeId ? { ...n, ...gdzie } : n))
    await db.paths.update(pathId, { nodes, edges, updatedAt: new Date().toISOString() })
  })
}

/** Stawia kafelek w ścieżce między afterId a beforeId; zwraca id nowego węzła. */
export async function wstawKafelek(pathId: string, conceptId: string, afterId: string | null, beforeId: string | null) {
  const id = crypto.randomUUID()
  await db.transaction('rw', db.paths, async () => {
    const p = await db.paths.get(pathId)
    if (!p) return
    const wezel: PathNode = { id, kind: 'block', conceptId, versionId: null, subpageId: null, ...miejsce(p.nodes, afterId, beforeId) }
    await db.paths.update(pathId, {
      nodes: [...p.nodes, wezel],
      edges: wLancuch(p.edges, id, afterId, beforeId),
      updatedAt: new Date().toISOString(),
    })
  })
  return id
}

/** Wyjmuje węzeł ze ścieżki (kafelek zostaje). */
export async function wyjmijWezel(pathId: string, nodeId: string) {
  await db.transaction('rw', db.paths, async () => {
    const p = await db.paths.get(pathId)
    if (!p) return
    await db.paths.update(pathId, {
      nodes: p.nodes.filter((n) => n.id !== nodeId),
      edges: bezWezla(p.edges, nodeId),
      updatedAt: new Date().toISOString(),
    })
  })
}
