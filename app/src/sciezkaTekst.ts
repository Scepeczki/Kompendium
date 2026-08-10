import { db, mainPageName } from './db'
import { topoOrder } from './topo'
import { kluczWlasnej, type BlockType, type PathNode } from './types'

/** Skopiowanie ścieżki jako zwykły tekst.
 *
 *  Po co: przerobiony rozdział wkleja się do rozmowy z AI po zadania do
 *  przećwiczenia, do maila, do notatnika. Wychodzi Markdown — czytelny gołym
 *  okiem, a każdy program go rozumie.
 *
 *  Tekst bierzemy dokładnie taki, jaki widać w ścieżce: własny, jeśli został
 *  tu napisany, a w przeciwnym razie z klocka. */
export interface OpcjeKopiowania {
  /** Tylko ten rozdział (jego id) — razem z tym, co pod nim stoi. */
  odRozdzialu?: string | null
  /** Dopisać nazwy rodzajów („Definicja: …"). */
  zRodzajami?: boolean
  /** Wziąć też komentarze (te, które nie wchodzą do skryptu). */
  zKomentarzami?: boolean
}

export async function sciezkaJakoTekst(
  pathId: string,
  nazwaRodzaju: (t: BlockType) => string,
  opcje: OpcjeKopiowania = {},
): Promise<string> {
  const p = await db.paths.get(pathId)
  if (!p) return ''
  const { zRodzajami = true, zKomentarzami = false, odRozdzialu = null } = opcje

  const uzyte = new Set<string>()
  for (const n of p.nodes) {
    if (n.kind === 'block') uzyte.add(n.conceptId)
    else if (n.kind === 'fusion') for (const c of n.parts) uzyte.add(c.conceptId)
  }
  const ids = [...uzyte]
  const [klocki, wersje, strony] = await Promise.all([
    db.concepts.where('id').anyOf(ids).toArray(),
    db.versions.where('conceptId').anyOf(ids).toArray(),
    db.subpages.where('conceptId').anyOf(ids).toArray(),
  ])
  const klockiById = new Map(klocki.map((c) => [c.id, c]))
  const stronaById = new Map(strony.map((s) => [s.id, s]))

  /** Treść jednego klocka tak, jak widać ją w ścieżce. */
  const tresc = (
    conceptId: string,
    versionId: string | null,
    subpageId: string | null | undefined,
    wlasne: Record<string, string> | undefined,
  ) => {
    const c = klockiById.get(conceptId)
    const moje = wersje
      .filter((v) => v.conceptId === conceptId)
      .sort((a, b) => a.version - b.version)
    const w = moje.find((v) => v.id === versionId) ?? moje.find((v) => v.id === c?.currentVersionId)
    const s = subpageId ? stronaById.get(subpageId) : undefined
    if (!w) return ''
    return wlasne?.[kluczWlasnej(w.id, s?.id)] ?? (s ? s.content : w.content)
  }

  const naglowek = (n: PathNode & { kind: 'block' }) => {
    const c = klockiById.get(n.conceptId)
    const nazwa = n.nazwa ?? c?.name ?? '(usunięty klocek)'
    if (!zRodzajami || !c) return nazwa
    return `${nazwaRodzaju(c.type)}: ${nazwa}`
  }

  const kolejnosc = topoOrder(p.nodes, p.edges)
  // wycinek od wskazanego rozdziału do następnego tego samego (lub wyższego) rzędu
  let wybrane = kolejnosc
  if (odRozdzialu) {
    const i = kolejnosc.findIndex((n) => n.id === odRozdzialu)
    if (i >= 0) {
      const start = kolejnosc[i]
      const poziom = start.kind === 'heading' ? start.level : 1
      let koniec = kolejnosc.length
      for (let j = i + 1; j < kolejnosc.length; j++) {
        const n = kolejnosc[j]
        if (n.kind === 'heading' && n.level <= poziom) {
          koniec = j
          break
        }
      }
      wybrane = kolejnosc.slice(i, koniec)
    }
  }

  const kawalki: string[] = []
  if (!odRozdzialu) kawalki.push(`# ${p.name}`)
  for (const n of wybrane) {
    if (n.kind === 'comment' && !zKomentarzami) continue
    if (n.kind === 'heading') {
      kawalki.push(`${'#'.repeat(Math.min(6, n.level + 1))} ${n.text}`)
    } else if (n.kind === 'text' || n.kind === 'comment') {
      kawalki.push(n.text)
    } else if (n.kind === 'block') {
      const t = tresc(n.conceptId, n.versionId, n.subpageId, n.wlasneTresci)
      const c = klockiById.get(n.conceptId)
      const strona = n.subpageId ? stronaById.get(n.subpageId) : undefined
      // nazwa strony tylko wtedy, gdy to nie główna — inaczej sam szum
      const dopisek = strona ? ` (${strona.name})` : c && !n.subpageId ? '' : ''
      kawalki.push(`**${naglowek(n)}**${dopisek}\n\n${t}`)
    } else if (n.kind === 'fusion') {
      const tytul = n.type && zRodzajami ? `${nazwaRodzaju(n.type)}: ${n.name}` : n.name
      if (n.content !== undefined) {
        kawalki.push(`**${tytul}**\n\n${n.content}`)
      } else {
        const czesci = n.parts.map((cz) =>
          tresc(cz.conceptId, cz.versionId, cz.subpageId, cz.wlasneTresci),
        )
        kawalki.push(`**${tytul}**\n\n${czesci.filter(Boolean).join('\n\n')}`)
      }
    }
  }
  return kawalki.filter((k) => k.trim() !== '').join('\n\n')
}

/** Nazwa strony głównej klocka — do podpisów przy kopiowaniu. */
export const nazwaGlownej = mainPageName
