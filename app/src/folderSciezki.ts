import { db, keepConceptInPath, przeniesDoSciezki } from './db'
import type { PathNode } from './types'

/** Kafelek w folderze ścieżki ma JEDEN tekst: pisanie w ścieżce zmienia go
 *  w bibliotece i odwrotnie. Poza folderem ścieżka trzyma własną kopię tekstu
 *  (pisanie w ścieżce nie rusza biblioteki).
 *
 *  Kafelek, który wchodzi do folderu, mógł mieć w ścieżce już własny tekst,
 *  inny niż w bibliotece. Wtedy pytamy, który zostaje bieżący; drugi trafia do
 *  osobnej wersji kafelka, więc nic nie przepada. */

type Pytanie = (opts: {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
}) => Promise<boolean>

/** Zdarzenie dla otwartej ścieżki: ma zapomnieć własne teksty tego kafelka. */
export const ZAPOMNIJ_WLASNE = 'komp:zapomnij-wlasne'

const wlasneKafelka = (nodes: PathNode[], conceptId: string): [string, string][] =>
  nodes.flatMap((n) =>
    n.kind === 'block' && n.conceptId === conceptId ? Object.entries(n.wlasneTresci ?? {}) : [],
  )

/** Własne teksty ścieżki, które różnią się od tekstu w bibliotece (klucz: wersja:strona). */
async function rozneTeksty(nodes: PathNode[], conceptId: string): Promise<Map<string, string>> {
  const rozne = new Map<string, string>()
  for (const [klucz, tekst] of wlasneKafelka(nodes, conceptId)) {
    const [versionId, stronaId] = klucz.split(':')
    const zBiblioteki = stronaId
      ? (await db.subpages.get(stronaId))?.content
      : (await db.versions.get(versionId))?.content
    if (zBiblioteki === undefined) continue
    if (zBiblioteki.trim() !== tekst.trim()) rozne.set(klucz, tekst)
  }
  return rozne
}

/** Scala teksty: wygrany zostaje w swojej wersji, przegrany idzie do nowej,
 *  niebieżącej wersji tego samego kafelka (ze swoimi stronami). */
async function scal(conceptId: string, rozne: Map<string, string>, zeSciezki: boolean) {
  const poWersjach = new Map<string, Map<string, string>>()
  for (const [klucz, tekst] of rozne) {
    const [versionId, stronaId] = klucz.split(':')
    if (!poWersjach.has(versionId)) poWersjach.set(versionId, new Map())
    poWersjach.get(versionId)!.set(stronaId, tekst)
  }
  for (const [versionId, teksty] of poWersjach) {
    const wersja = await db.versions.get(versionId)
    if (!wersja) continue
    const wszystkie = await db.versions.where('conceptId').equals(conceptId).toArray()
    const strony = await db.subpages.where('[conceptId+versionId]').equals([conceptId, versionId]).toArray()
    const t = new Date().toISOString()
    const noweId = crypto.randomUUID()
    const nowaStrona = new Map(strony.map((s) => [s.id, crypto.randomUUID()]))
    // kopia dostaje tekst przegrany: bibliotekę, gdy wygrywa ścieżka, i odwrotnie
    const tekstKopii = (stronaId: string, zBiblioteki: string) =>
      zeSciezki ? zBiblioteki : (teksty.get(stronaId) ?? zBiblioteki)
    await db.transaction('rw', db.versions, db.subpages, async () => {
      await db.versions.add({
        ...wersja,
        id: noweId,
        version: Math.max(...wszystkie.map((v) => v.version)) + 1,
        label: zeSciezki ? 'z biblioteki, przed scaleniem ze ścieżką' : 'tekst ze ścieżki',
        content: tekstKopii('', wersja.content),
        sourceRefs: wersja.sourceRefs.map((r) => ({ ...r, id: crypto.randomUUID() })),
        sourceGroups: wersja.sourceGroups ? [...wersja.sourceGroups] : undefined,
        createdAt: t,
        updatedAt: t,
      })
      if (strony.length) {
        await db.subpages.bulkAdd(
          strony.map((s) => ({
            ...s,
            id: nowaStrona.get(s.id)!,
            versionId: noweId,
            content: tekstKopii(s.id, s.content),
            createdAt: t,
            updatedAt: t,
          })),
        )
      }
      if (zeSciezki) {
        if (teksty.has('')) await db.versions.update(versionId, { content: teksty.get('')!, updatedAt: t })
        for (const s of strony) {
          if (teksty.has(s.id)) await db.subpages.update(s.id, { content: teksty.get(s.id)!, updatedAt: t })
        }
      }
    })
  }
}

/** Wkłada kafelek do folderu ścieżki. `naKoniec`: dokłada go też na koniec
 *  ścieżki, jeśli w niej nie stał (upuszczenie na ścieżkę w liście).
 *  `nodes`: aktualny stan otwartej ścieżki, gdy jest świeższy niż baza. */
export async function wlozDoFolderuSciezki(
  pathId: string,
  conceptId: string,
  pytaj: Pytanie,
  { naKoniec, nodes }: { naKoniec: boolean; nodes?: PathNode[] },
) {
  const wezly = nodes ?? (await db.paths.get(pathId))?.nodes ?? []
  const rozne = await rozneTeksty(wezly, conceptId)
  if (rozne.size) {
    const nazwa = (await db.concepts.get(conceptId))?.name ?? ''
    const zeSciezki = await pytaj({
      title: `Który tekst kafelka „${nazwa}" zachować?`,
      message:
        'W tej ścieżce kafelek ma tekst inny niż w bibliotece. W folderze ścieżki ' +
        'kafelek ma jeden tekst: zmiana w ścieżce zmienia go w bibliotece i odwrotnie. ' +
        'Wybrany tekst będzie bieżący, a drugi zostanie zachowany jako osobna wersja kafelka.',
      confirmLabel: 'Tekst ze ścieżki',
      cancelLabel: 'Tekst z biblioteki',
    })
    await scal(conceptId, rozne, zeSciezki)
  }
  if (wlasneKafelka(wezly, conceptId).length) {
    const p = await db.paths.get(pathId)
    if (p) {
      await db.paths.update(pathId, {
        nodes: p.nodes.map((n) =>
          n.kind === 'block' && n.conceptId === conceptId ? { ...n, wlasneTresci: undefined } : n,
        ),
      })
    }
    window.dispatchEvent(new CustomEvent(ZAPOMNIJ_WLASNE, { detail: { pathId, conceptId } }))
  }
  if (naKoniec) await przeniesDoSciezki(pathId, conceptId)
  else await keepConceptInPath(pathId, conceptId)
}
