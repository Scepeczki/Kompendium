/** Naprawa starych znaków ucieczki.
 *
 *  Przez pewien czas zapis zabezpieczał każdy znak specjalny: pisząc
 *  `\mathcal{A}` dostawało się w bazie `\\mathcal\{A\}`. We wzorach
 *  psuło to LaTeX, bo `\\` znaczy dla KaTeX-a zupełnie co innego niż `\`.
 *
 *  ODWRACANIE JEST JEDNOZNACZNE, o ile robi się je jednym przejściem: dawny
 *  zapis podwajał każdy backslash i stawiał backslash przed każdym znakiem
 *  przestankowym. Zdejmujemy więc dokładnie jedną warstwę — `\\` wraca do
 *  `\`, a backslash przed znakiem NIEBĘDĄCYM literą znika. Backslash przed
 *  literą zostaje, bo to nazwa polecenia LaTeX-a (`\bigcup`).
 *
 *  Dzięki temu `\\\{A` wraca jako `\{A` (nawias klamrowy zbioru, ma zostać
 *  z backslashem), a `\\mathcal\{A\}` jako `\mathcal{A}`. Jedno przejście
 *  rozróżnia te przypadki same z siebie.
 *
 *  RUSZAMY TYLKO USZKODZONE. Poprawny LaTeX też bywa z `\\` (łamanie wiersza
 *  w macierzy), więc bierzemy pod uwagę wyłącznie teksty, w których po
 *  podwójnym backslashu stoi litera — czyli ślad po dawnym zabezpieczaniu
 *  nazwy polecenia. Nic innego nie jest dotykane.
 */

import { db } from './db'
import type { FusionPart, PathNode } from './types'

/** Ślad uszkodzenia: podwójny backslash przed literą (`\\mathcal`). */
const USZKODZONY = /\\\\[a-zA-Z]/

export const jestUszkodzony = (s: string | undefined): boolean =>
  typeof s === 'string' && USZKODZONY.test(s)

/** Zdejmuje jedną warstwę zabezpieczenia — jednym przejściem, od lewej. */
export function odkrec(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      const n = s[i + 1]
      // `\\` wraca do `\`; backslash przed znakiem przestankowym znika;
      // backslash przed literą to nazwa polecenia — zostaje
      if (n === '\\') {
        out += '\\'
        i++
        continue
      }
      if (!/[a-zA-Z0-9]/.test(n)) {
        out += n
        i++
        continue
      }
    }
    out += s[i]
  }
  return out
}

export interface Uszkodzenia {
  wersje: number
  strony: number
  sciezki: number
}

/** Ile rzeczy nosi ślad dawnego zabezpieczania. */
export async function policzUszkodzone(): Promise<Uszkodzenia> {
  const [wersje, strony, sciezki] = await Promise.all([
    db.versions.toArray(),
    db.subpages.toArray(),
    db.paths.toArray(),
  ])
  const wSciezce = (n: PathNode): boolean => {
    if (n.kind === 'text' || n.kind === 'comment' || n.kind === 'heading') {
      return jestUszkodzony(n.text)
    }
    const wlasne = (w: Record<string, string> | undefined) =>
      Object.values(w ?? {}).some(jestUszkodzony)
    if (n.kind === 'block') return jestUszkodzony(n.nazwa) || wlasne(n.wlasneTresci)
    return (
      jestUszkodzony(n.content) ||
      n.parts.some((p: FusionPart) => wlasne(p.wlasneTresci))
    )
  }
  return {
    wersje: wersje.filter((v) => jestUszkodzony(v.content)).length,
    strony: strony.filter((s) => jestUszkodzony(s.content)).length,
    sciezki: sciezki.filter((p) => p.nodes.some(wSciezce)).length,
  }
}

/** Naprawia wszystko, co nosi ten ślad. Zwraca, ilu rzeczy dotyczyło. */
export async function napraw(): Promise<Uszkodzenia> {
  const przed = await policzUszkodzone()

  await db.versions
    .toCollection()
    .modify((v) => {
      if (jestUszkodzony(v.content)) v.content = odkrec(v.content)
    })
  await db.subpages
    .toCollection()
    .modify((s) => {
      if (jestUszkodzony(s.content)) s.content = odkrec(s.content)
    })
  await db.paths.toCollection().modify((p) => {
    const wlasne = (w: Record<string, string> | undefined) => {
      if (!w) return
      for (const [k, v] of Object.entries(w)) if (jestUszkodzony(v)) w[k] = odkrec(v)
    }
    for (const n of p.nodes as PathNode[]) {
      if (n.kind === 'text' || n.kind === 'comment' || n.kind === 'heading') {
        if (jestUszkodzony(n.text)) n.text = odkrec(n.text)
      } else if (n.kind === 'block') {
        if (jestUszkodzony(n.nazwa)) n.nazwa = odkrec(n.nazwa!)
        wlasne(n.wlasneTresci)
      } else {
        if (jestUszkodzony(n.content)) n.content = odkrec(n.content!)
        for (const cz of n.parts as FusionPart[]) {
          wlasne(cz.wlasneTresci)
        }
      }
    }
  })

  return przed
}
