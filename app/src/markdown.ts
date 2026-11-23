import { marked } from 'marked'
import katex from 'katex'
import DOMPurify from 'dompurify'
import { adresObrazu, czytajUklad, wymiaryObrazu } from './obrazy'

marked.setOptions({ gfm: true, breaks: false })

// Wcięcie to wcięcie, a nie kod.
//
// Markdown zamienia każdy akapit wcięty o cztery spacje w blok kodu — szarą
// ramkę z tekstem pisanym maszyną. W notatkach z matematyki to katastrofa:
// wystarczy wciąć zdanie albo punkt listy i całość zmienia się w „kod", a LaTeX
// przestaje się liczyć jako LaTeX. Wyłączamy więc rozpoznawanie kodu po samym
// wcięciu. Bloki pisane wprost, przez ```, działają jak dotąd.
marked.use({ tokenizer: { code: () => undefined } })

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Wzór skopiowany z tabeli Markdowna (np. z czatu) ma `\|` w opisie kolumn
 *  `{c\|c}`, bo tam kreskę trzeba było zabezpieczyć. W tym miejscu `\|` nie
 *  znaczy nic innego, więc rysujemy zwykłą kreskę. Tekstu nie zmieniamy. */
export const poprawWzor = (tex: string): string =>
  tex.replace(/(\\begin\{(?:array|tabular)\}\{)([^}]*)/g, (_, p: string, k: string) =>
    p + k.replace(/\\\|/g, '|'),
  )

export interface RenderOptions {
  /** Czy pojęcie o danej nazwie istnieje (do stylowania brakujących linków). */
  exists?: (name: string) => boolean
}

/**
 * Renderuje Markdown + LaTeX do bezpiecznego HTML.
 * - Wzory ($...$ i $$...$$) są wycinane przed parsowaniem Markdownu,
 *   renderowane KaTeX-em i wstawiane z powrotem na końcu.
 * - Wiki-linki [[Nazwa]] i [[Nazwa|tekst]] stają się klikalnymi odnośnikami
 *   do innych kafelków (obsługa kliknięć w komponencie podglądu).
 */
/** Pamięć podręczna wyników — renderowanie (Markdown + KaTeX + sanityzacja)
 *  jest kosztowne, a te same treści rysujemy wielokrotnie: na mapie, w linii,
 *  w skrypcie i przy każdym przerysowaniu kafelka podczas przeciągania.
 *  Cachujemy tylko wywołania bez `exists`, bo tamte zależą od stanu bazy. */
const cache = new Map<string, string>()
const CACHE_MAX = 400

export function renderMarkdown(src: string, opts: RenderOptions = {}): string {
  const cacheable = !opts.exists
  if (cacheable) {
    const hit = cache.get(src)
    if (hit !== undefined) return hit
  }
  const html = renderMarkdownUncached(src, opts)
  if (cacheable) {
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(src, html)
  }
  return html
}

/** Puste linijki wpisane świadomie mają być widoczne.
 *
 *  Markdown traktuje dowolny ciąg pustych linii jak jeden koniec akapitu, więc
 *  odstęp zrobiony w kafelku znikał przy czytaniu w ścieżce. Każdą nadmiarową
 *  pustą linię zamieniamy na akapit z twardą spacją. Bloki kodu zostawiamy
 *  w spokoju — tam puste linie znaczą dokładnie to, co jest napisane. */
export function zachowajPusteLinie(src: string): string {
  return src
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((czesc, i) =>
      i % 2 === 1
        ? czesc
        : czesc.replace(/\n{3,}/g, (m) => '\n\n' + '&nbsp;\n\n'.repeat(m.length - 2)),
    )
    .join('')
}

function renderMarkdownUncached(src: string, opts: RenderOptions): string {
  const stashed: string[] = []
  const stash = (html: string) => `%%STASH${stashed.push(html) - 1}%%`

  let text = zachowajPusteLinie(src).replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) =>
    stash(katex.renderToString(poprawWzor(tex), { displayMode: true, throwOnError: false })),
  )
  text = text.replace(/\$([^$\n]+?)\$/g, (_, tex: string) =>
    stash(katex.renderToString(poprawWzor(tex), { displayMode: false, throwOnError: false })),
  )

  // wiki-linki: [[Nazwa]] albo [[Nazwa|wyświetlany tekst]]
  text = text.replace(
    /\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/g,
    (_, rawName: string, alias?: string) => {
      const name = rawName.trim()
      const label = (alias ?? rawName).trim()
      const missing = opts.exists ? !opts.exists(name) : false
      return stash(
        `<a href="#" class="wikilink${missing ? ' wikilink-missing' : ''}" data-target="${escapeHtml(
          name,
        )}">${escapeHtml(label)}</a>`,
      )
    },
  )

  let html = marked.parse(text) as string
  html = html.replace(/%%STASH(\d+)%%/g, (_, i: string) => stashed[Number(i)])
  // odnośnik do zdjęcia zamieniamy przed czyszczeniem: nieznany adres by wyleciał
  // Wymiary rezerwują miejsce, zanim zdjęcie się narysuje (CSS: height auto
  // trzyma proporcje); data-obraz pozwala uzupełnić wymiary starszym zdjęciom.
  html = html.replace(/src="(obraz:[^"]+)"/g, (_, src: string) => {
    const w = wymiaryObrazu(src)
    return `src="${adresObrazu(src)}" data-obraz="${src}"${w ? ` width="${w.w}" height="${w.h}"` : ''}`
  })
  // `semantics`/`annotation` MUSZĄ przetrwać czyszczenie.
  //
  // KaTeX chowa w nich ŹRÓDŁOWY TeX wzoru — to jedyne miejsce, z którego da
  // się go odzyskać przy kopiowaniu. Domyślne DOMPurify kasowało sam element,
  // ale zostawiało jego tekst: źródło zostawało w drzewie jako bezpański
  // napis obok glifów i zapisu MathML, więc skopiowany wzór wracał potrojony
  // („y1y_1y1​"), a program nie miał gdzie szukać samego TeX-a.
  html = DOMPurify.sanitize(html, {
    ADD_TAGS: ['semantics', 'annotation'],
    ADD_ATTR: ['encoding'],
  })
  // układ zdjęcia z tytułu obrazka; patrz src/obrazy.ts
  html = html.replace(/(<img\b[^>]*?)title="(zdjecie[^"]*)"/g, (_, poczatek: string, tytul: string) => {
    const { szerokosc, polozenie } = czytajUklad(tytul)
    const styl = szerokosc ? ` style="width:${szerokosc}%;max-width:100%"` : ''
    return `${poczatek}class="zdj-${polozenie}"${styl}`
  })
  // znaczniki wcięć akapitów ⟦wL,F⟧ / ⟦wL,F,R⟧ (px) → style; patrz src/indent.ts
  html = html.replace(
    /<(p|li)>⟦w(-?\d+),(-?\d+)(?:,(\d+))?⟧/g,
    (_, tag: string, l: string, f: string, r?: string) =>
      `<${tag} style="margin-left:${l}px;text-indent:${f}px${
        r ? `;margin-right:${r}px` : ''
      }">`,
  )
  // znaczniki rozmiaru tekstu ⟦sNN⟧…⟦/s⟧ → span; patrz src/textsize.ts
  html = html
    .replace(/⟦s(\d{1,2})⟧/g, '<span style="font-size:$1px">')
    .replace(/⟦\/s⟧/g, '</span>')
  return html
}

/** Wyciąga nazwy pojęć linkowanych w treści ([[...]]), bez aliasów. */
export function extractLinks(src: string): string[] {
  const names = new Set<string>()
  for (const m of src.matchAll(/\[\[([^\[\]|]+)(?:\|[^\[\]]+)?\]\]/g)) {
    const name = m[1].trim()
    if (name) names.add(name)
  }
  return [...names]
}

/** Dzieli tekst na bloki najwyższego poziomu — to, co w markdownie rozdziela
 *  pusta linia. Pusta linia w środku `$$…$$` i w płocie z apostrofów należy
 *  do środka i nie dzieli. */
export function blokiZrodla(src: string): string[] {
  const bloki: string[] = []
  let biezacy: string[] = []
  let wPlocie = false
  let weWzorze = false
  const zamknij = () => {
    const t = biezacy.join('\n').trim()
    if (t) bloki.push(t)
    biezacy = []
  }
  for (const linia of src.replace(/\r\n?/g, '\n').split('\n')) {
    const goly = linia.trim()
    if (!wPlocie && !weWzorze && goly === '') {
      zamknij()
      continue
    }
    if (!weWzorze && /^(```|~~~)/.test(goly)) wPlocie = !wPlocie
    else if (!wPlocie && goly === '$$') weWzorze = !weWzorze
    biezacy.push(linia)
  }
  zamknij()
  return bloki
}

/** TeX z wyrenderowanego wzoru — KaTeX chowa źródło w MathML. */
function texZeWzoru(el: Element): string {
  const tex = el.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? ''
  if (!tex.trim()) return el.textContent ?? ''
  const blokowy = el.classList.contains('katex-display') || !!el.closest('.katex-display')
  return blokowy ? `$$${tex}$$` : `$${tex}$`
}

/** Tekst zaznaczenia złożony z drzewa, z wzorami oddanymi jako TeX.
 *
 *  Używane tam, gdzie nie znamy źródła blok po bloku. Znaczniki markdownu
 *  (pogrubienia, listy) w wyrenderowanym tekście już nie istnieją, więc nie
 *  wrócą — ale wzory tak, a to one robiły z kopiowania bełkot. */
export function zrodloZDrzewa(zakres: Range): string {
  const czesc = zakres.cloneRange()
  // wzór ma wejść w całości, choćby zaznaczenie zaczynało się w jego środku
  const wzor = (n: Node | null) =>
    (n instanceof Element ? n : (n?.parentElement ?? null))?.closest('.katex') ?? null
  const a = wzor(czesc.startContainer)
  if (a) czesc.setStartBefore(a)
  const b = wzor(czesc.endContainer)
  if (b) czesc.setEndAfter(b)
  const frag = czesc.cloneContents()
  for (const el of [...frag.querySelectorAll('.katex')]) {
    el.replaceWith(document.createTextNode(texZeWzoru(el)))
  }
  // `textContent` sklejałby akapity w jeden ciąg bez odstępu. Wkładamy
  // wycinek na chwilę do strony i czytamy `innerText` — ten zna granice
  // akapitów i sam stawia między nimi pustą linię.
  const kosz = document.createElement('div')
  kosz.style.cssText = 'position:fixed;left:-9999px;top:0;width:40em;white-space:pre-wrap'
  kosz.appendChild(frag)
  document.body.appendChild(kosz)
  const tekst = kosz.innerText
  kosz.remove()
  return tekst.replace(/\n{3,}/g, '\n\n').trim()
}

/** Zaznaczenie w podglądzie → ŹRÓDŁO, a nie to, co widać na ekranie.
 *
 *  Bez tego kopiowanie wzorów dawało bełkot: KaTeX trzyma jeden wzór w DOM-ie
 *  trzy razy naraz (glify do patrzenia, MathML dla czytników i sam TeX
 *  w środku), więc zwykłe `toString()` skleja wszystkie trzy w jeden ciąg.
 *
 *  Bloki objęte zaznaczeniem W CAŁOŚCI oddajemy wprost ze źródła (`data-md`) —
 *  wtedy wracają też pogrubienia, listy i wcięcia, których w wyrenderowanym
 *  tekście już nie widać. Blok napoczęty od środka składamy z drzewa,
 *  podmieniając wzory na ich TeX. */
export function zaznaczenieNaZrodlo(zakres: Range, pojemnik: Element): string {
  const bloki = [...pojemnik.querySelectorAll('[data-md]')].filter((b) =>
    zakres.intersectsNode(b),
  )
  if (bloki.length === 0) return ''

  const kawalki: string[] = []
  for (const blok of bloki) {
    const caly = document.createRange()
    caly.selectNodeContents(blok)
    // część wspólna zaznaczenia z tym blokiem
    const czesc = caly.cloneRange()
    if (zakres.compareBoundaryPoints(Range.START_TO_START, caly) > 0) {
      czesc.setStart(zakres.startContainer, zakres.startOffset)
    }
    if (zakres.compareBoundaryPoints(Range.END_TO_END, caly) < 0) {
      czesc.setEnd(zakres.endContainer, zakres.endOffset)
    }
    // Cały blok objęty? Rozstrzygamy po TEKŚCIE, nie po granicach węzłów:
    // zaznaczenie zaczyna się w środku akapitu (w węźle tekstowym), a granica
    // bloku leży przed nim — porównanie granic uznawało więc całość za
    // napoczętą i gubiło pogrubienia oraz listy.
    if (czesc.toString().trim() === (blok.textContent ?? '').trim()) {
      kawalki.push(blok.getAttribute('data-md') ?? '')
      continue
    }
    const tekst = zrodloZDrzewa(czesc)
    if (tekst) kawalki.push(tekst)
  }
  return kawalki.filter(Boolean).join('\n\n')
}
