import { EditorView, keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'

/** Zawijanie długich wierszy — bez tego pisanie ciągłego tekstu wymaga
 *  przewijania w bok. Dotyczy każdego pola z kodem w aplikacji. */
export const wrapLines = EditorView.lineWrapping

/** Owija zaznaczenie znacznikami (albo wstawia pustą parę i staje w środku). */
const wrap = (left: string, right: string) => (view: EditorView) => {
  const { from, to } = view.state.selection.main
  const sel = view.state.doc.sliceString(from, to)
  view.dispatch({
    changes: { from, to, insert: `${left}${sel}${right}` },
    selection: { anchor: from + left.length, head: from + left.length + sel.length },
  })
  return true
}

/** Skróty formatowania Markdown+LaTeX w trybie kodu:
 *  Ctrl+B pogrubienie, Ctrl+I kursywa, Ctrl+M wzór $…$, Ctrl+Shift+M wzór $$…$$. */
export const mdShortcuts = Prec.high(
  keymap.of([
    { key: 'Mod-b', run: wrap('**', '**') },
    { key: 'Mod-i', run: wrap('*', '*') },
    { key: 'Mod-m', run: wrap('$', '$') },
    { key: 'Mod-Shift-m', run: wrap('$$', '$$') },
  ]),
)
