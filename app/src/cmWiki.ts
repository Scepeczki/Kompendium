import {
  acceptCompletion,
  autocompletion,
  type CompletionContext,
} from '@codemirror/autocomplete'
import { keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'

/** Autouzupełnianie wiki-linków: po wpisaniu `[[` podpowiada nazwy istniejących
 *  pojęć; wybór domyka `]]`. */
export const wikiCompletion = (names: () => string[]) => [
  // Enter/Tab akceptują podpowiedź zanim przechwyci je keymapa Markdownu
  // (gdy podpowiedź nieaktywna, acceptCompletion zwraca false i Enter działa zwykle)
  Prec.highest(
    keymap.of([
      { key: 'Enter', run: acceptCompletion },
      { key: 'Tab', run: acceptCompletion },
    ]),
  ),
  autocompletion({
    override: [
      (ctx: CompletionContext) => {
        const m = ctx.matchBefore(/\[\[([^\]]*)$/)
        if (!m) return null
        return {
          from: m.from + 2,
          options: names().map((n) => ({
            label: n,
            type: 'text',
            // auto-domykanie nawiasów mogło już wstawić ]] — nie dublujemy go
            apply: (view, _c, from, to) => {
              const closed = view.state.doc.sliceString(to, to + 2) === ']]'
              const insert = closed ? n : `${n}]]`
              view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: from + n.length + 2 },
              })
            },
          })),
          validFor: /^[^\]]*$/,
        }
      },
    ],
  }),
]
