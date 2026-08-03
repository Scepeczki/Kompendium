import { marked } from 'marked'
import katex from 'katex'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: false })

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface RenderOptions {
  /** Czy pojęcie o danej nazwie istnieje (do stylowania brakujących linków). */
  exists?: (name: string) => boolean
}

/**
 * Renderuje Markdown + LaTeX do bezpiecznego HTML.
 * - Wzory ($...$ i $$...$$) są wycinane przed parsowaniem Markdownu,
 *   renderowane KaTeX-em i wstawiane z powrotem na końcu.
 * - Wiki-linki [[Nazwa]] i [[Nazwa|tekst]] stają się klikalnymi odnośnikami
 *   do innych klocków (obsługa kliknięć w komponencie podglądu).
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

function renderMarkdownUncached(src: string, opts: RenderOptions): string {
  const stashed: string[] = []
  const stash = (html: string) => `%%STASH${stashed.push(html) - 1}%%`

  let text = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) =>
    stash(katex.renderToString(tex, { displayMode: true, throwOnError: false })),
  )
  text = text.replace(/\$([^$\n]+?)\$/g, (_, tex: string) =>
    stash(katex.renderToString(tex, { displayMode: false, throwOnError: false })),
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
  html = DOMPurify.sanitize(html)
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
