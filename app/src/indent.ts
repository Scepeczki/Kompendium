import type { Editor } from '@tiptap/core'

// ---------------------------------------------------------------------------
// Wcięcia akapitów (lokalne — dotyczą konkretnych akapitów).
// Markdown nie zna wcięć, więc zapisujemy je jako mały znacznik tekstowy na
// początku akapitu: ⟦wL,F⟧ albo ⟦wL,F,R⟧ (wartości w px).
//   L = wcięcie całego akapitu z lewej,
//   F = dodatkowe wcięcie pierwszej linii (ujemne = wysunięcie),
//   R = wcięcie z prawej.
// W trybie wizualnym znacznik jest ukryty (dekoracje — jak kod wzorów LaTeX),
// w podglądzie zamienia się na style, w widoku Kod widać go jawnie.
// ---------------------------------------------------------------------------

export const INDENT_RE = /^⟦w(-?\d+),(-?\d+)(?:,(\d+))?⟧/

/** Wersja bez kotwicy — do szukania znacznika zgubionego w środku akapitu. */
export const INDENT_RE_ANY = /⟦w-?\d+,-?\d+(?:,\d+)?⟧/

export const INDENT_MAX = 400

export interface Indents {
  left: number
  first: number
  right: number
}

export const NO_INDENTS: Indents = { left: 0, first: 0, right: 0 }

export const parseIndents = (text: string): Indents | null => {
  const m = INDENT_RE.exec(text)
  return m
    ? { left: Number(m[1]), first: Number(m[2]), right: Number(m[3] ?? 0) }
    : null
}

export const indentMarker = (i: Indents): string =>
  i.left || i.first || i.right
    ? `⟦w${i.left},${i.first}${i.right ? `,${i.right}` : ''}⟧`
    : ''

export const indentStyle = (i: Indents): string =>
  `margin-left:${i.left}px;text-indent:${i.first}px` +
  (i.right ? `;margin-right:${i.right}px` : '')

/** Wcięcia akapitu, w którym stoi początek zaznaczenia. */
export function readIndents(editor: Editor): Indents {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d >= 0; d--) {
    const node = $from.node(d)
    if (node.isTextblock) {
      const first = node.firstChild
      return (first?.isText && parseIndents(first.text ?? '')) || NO_INDENTS
    }
  }
  return NO_INDENTS
}

/** Nakłada wcięcia na wszystkie akapity objęte zaznaczeniem
 *  (podmienia/wstawia/usuwa znacznik na początku każdego z nich). */
export function applyIndents(editor: Editor, ind: Indents): void {
  const { state, view } = editor
  const { from, to } = state.selection
  const blocks: { pos: number; len: number }[] = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      const first = node.firstChild
      const m = first?.isText ? INDENT_RE.exec(first.text ?? '') : null
      blocks.push({ pos, len: m ? m[0].length : 0 })
      return false
    }
    return true
  })
  const marker = indentMarker(ind)
  const tr = state.tr
  // od końca, żeby wcześniejsze zmiany nie przesuwały pozycji
  for (const b of blocks.reverse()) {
    if (b.len === 0 && marker === '') continue
    tr.insertText(marker, b.pos + 1, b.pos + 1 + b.len)
  }
  if (tr.docChanged) view.dispatch(tr)
}
