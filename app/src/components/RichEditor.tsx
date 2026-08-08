import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Paragraph from '@tiptap/extension-paragraph'
import { Markdown } from 'tiptap-markdown'
import katex from 'katex'
import { OBEJMUJACE } from '../cmShortcuts'
import { PageRuler } from './PageRuler'
import { SpacingMenu } from './SpacingMenu'
import { INDENT_RE, INDENT_RE_ANY, indentStyle, parseIndents } from '../indent'
import {
  SIZE_OPTIONS,
  applySizeToSelection,
  blockTextWithMap,
  findSizeSpans,
  sizeAtPos,
  sizeAtSelection,
  sizeRangesInDoc,
} from '../textsize'

/** Renderuje wzory $...$ i $$...$$ w miejscu (dekoracje nad tekstem).
 *  Tekst w dokumencie pozostaje czystym LaTeX-em (bezpieczny Markdown);
 *  gdy kursor wejdzie we wzór, widać jego kod — jak w dobrym Overleafie. */
const MathRender = Extension.create({
  name: 'mathRender',
  addProseMirrorPlugins() {
    const build = (doc: import('@tiptap/pm/model').Node, selFrom: number, selTo: number) => {
      const decos: Decoration[] = []
      // wzór jest osobnym elementem obok tekstu, więc nie dziedziczy rozmiaru
      // z dekoracji ⟦sNN⟧ — ustawiamy go jawnie
      const sizes = sizeRangesInDoc(doc)
      doc.descendants((node, pos) => {
        if (!node.isText) return
        const text = node.text ?? ''
        const re = /\$\$([^$]+?)\$\$|\$([^$\n]+?)\$/g
        let m: RegExpExecArray | null
        while ((m = re.exec(text))) {
          const from = pos + m.index
          const to = from + m[0].length
          const caretInside = selFrom <= to && selTo >= from
          if (caretInside) {
            decos.push(Decoration.inline(from, to, { class: 'math-src' }))
            continue
          }
          const display = m[1] !== undefined
          const tex = m[1] ?? m[2]
          const el = document.createElement(display ? 'div' : 'span')
          el.className = `math-render${display ? ' math-render-display' : ''}`
          const size = sizeAtPos(sizes, from)
          if (size !== null) el.style.fontSize = `${size}px`
          try {
            katex.render(tex, el, { displayMode: display, throwOnError: false })
          } catch {
            el.textContent = m[0]
          }
          decos.push(Decoration.widget(from, el, { side: 1 }))
          decos.push(Decoration.inline(from, to, { class: 'math-hide' }))
        }
      })
      return decos
    }
    return [
      new Plugin({
        key: new PluginKey('mathRender'),
        props: {
          decorations(state) {
            return DecorationSet.create(
              state.doc,
              build(state.doc, state.selection.from, state.selection.to),
            )
          },
        },
      }),
    ]
  },
})

/** Renderuje wcięcia akapitów ze znaczników ⟦w…⟧ (patrz src/indent.ts):
 *  akapit dostaje styl, sam znacznik jest schowany. Dodatkowo samonaprawa —
 *  znacznik, który przestał być na początku akapitu (np. użytkownik wpisał
 *  coś przed nim), wraca na początek zamiast straszyć w treści. */
const IndentRender = Extension.create({
  name: 'indentRender',
  addProseMirrorPlugins() {
    const build = (doc: import('@tiptap/pm/model').Node) => {
      const decos: Decoration[] = []
      doc.descendants((node, pos) => {
        if (!node.isTextblock) return true
        const first = node.firstChild
        const ind = first?.isText ? parseIndents(first.text ?? '') : null
        if (ind) {
          const len = INDENT_RE.exec(first!.text ?? '')![0].length
          decos.push(
            Decoration.node(pos, pos + node.nodeSize, { style: indentStyle(ind) }),
          )
          decos.push(Decoration.inline(pos + 1, pos + 1 + len, { class: 'ind-hide' }))
        }
        return false
      })
      return decos
    }
    return [
      new Plugin({
        key: new PluginKey('indentRender'),
        props: {
          decorations(state) {
            return DecorationSet.create(state.doc, build(state.doc))
          },
        },
        appendTransaction(trs, _old, state) {
          if (!trs.some((t) => t.docChanged)) return null
          let tr: typeof state.tr | null = null
          state.doc.descendants((node, pos) => {
            if (!node.isTextblock) return true
            // znajdź znacznik w tekście akapitu (tylko w całym, pojedynczym
            // fragmencie tekstu — pocięty formatowaniem zostawiamy w spokoju)
            let off = 0
            node.forEach((child) => {
              if (child.isText && child.text) {
                const m = INDENT_RE_ANY.exec(child.text)
                if (m && off + m.index > 0 && !tr) {
                  const from = pos + 1 + off + m.index
                  tr = state.tr
                    .delete(from, from + m[0].length)
                    .insertText(m[0], pos + 1, pos + 1)
                }
              }
              off += child.nodeSize
            })
            return false
          })
          return tr
        },
      }),
    ]
  },
})

/** Renderuje rozmiar tekstu ze znaczników ⟦sNN⟧…⟦/s⟧ (patrz src/textsize.ts):
 *  fragment dostaje font-size, a same znaczniki są niewidoczne (rozmiar zmienia
 *  się kontrolką w pasku, więc podglądanie ich kodu jest zbędne). */
const SizeRender = Extension.create({
  name: 'sizeRender',
  addProseMirrorPlugins() {
    const build = (doc: import('@tiptap/pm/model').Node) => {
      const decos: Decoration[] = []
      doc.descendants((node, pos) => {
        if (!node.isTextblock) return true
        const base = pos + 1
        const { text, map } = blockTextWithMap(node)
        const docAt = (i: number) =>
          base + (i < map.length ? map[i] : node.content.size)
        for (const s of findSizeSpans(text)) {
          const tokens: [number, number][] = [
            [docAt(s.openFrom), docAt(s.openTo)],
            [docAt(s.closeFrom), docAt(s.closeTo)],
          ]
          for (const [f, t] of tokens) {
            decos.push(Decoration.inline(f, t, { class: 'ind-hide' }))
          }
          const innerF = docAt(s.openTo)
          const innerT = docAt(s.closeFrom)
          if (innerF < innerT) {
            decos.push(
              Decoration.inline(innerF, innerT, { style: `font-size:${s.size}px` }),
            )
          }
        }
        return false
      })
      return decos
    }
    return [
      new Plugin({
        key: new PluginKey('sizeRender'),
        props: {
          decorations(state) {
            return DecorationSet.create(state.doc, build(state.doc))
          },
        },
      }),
    ]
  },
})

/** Akapit, który przeżywa bycie pustym.
 *
 *  Markdown nie zna „pustej linijki" jako treści — dwa entery pod rząd znaczą
 *  w nim tylko „koniec akapitu". Puste akapity, które ktoś świadomie zrobił,
 *  ginęły więc przy zapisie i w ścieżce odstęp znikał. Zapisujemy je jako
 *  akapit z twardą spacją: to zwykły Markdown, czytelny w każdym innym
 *  programie, a przy wczytaniu wraca jako pusty akapit. */
const PUSTA_LINIA = '&nbsp;'

interface StanZapisu {
  write: (s: string) => void
  renderInline: (n: unknown) => void
  closeBlock: (n: unknown) => void
}
interface WezelAkapitu {
  content: { size: number }
}
interface Rodzic {
  childCount: number
  child: (i: number) => WezelAkapitu
}

const BlankParagraph = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(
          state: StanZapisu,
          node: WezelAkapitu,
          parent: Rodzic | undefined,
          index: number | undefined,
        ) {
          // Przerwą jest pusty akapit, który ma coś przed sobą i coś po sobie.
          // Pusty klocek albo puste linie na końcu to nie „odstęp", tylko brak
          // treści — inaczej każdy nowy klocek zaczynałby się od &nbsp;.
          const pusty = node.content.size === 0
          const wSrodku =
            pusty && parent !== undefined && index !== undefined
              ? [...Array(parent.childCount).keys()].some(
                  (i) => i < index && parent.child(i).content.size > 0,
                ) &&
                [...Array(parent.childCount).keys()].some(
                  (i) => i > index && parent.child(i).content.size > 0,
                )
              : false
          if (wSrodku) state.write(PUSTA_LINIA)
          else if (!pusty) state.renderInline(node)
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

interface Props {
  /** Treść w Markdownie (źródło prawdy) — wczytywana raz przy montowaniu;
   *  komponent montuj z key={id wersji}, żeby zmiana klocka przeładowała treść. */
  value: string
  editable: boolean
  onChange: (markdown: string) => void
  /** Linijka szerokości strony — tylko tam, gdzie treść jest „stroną"
   *  (w oknie notatki nie ma sensu, bo okno nie jest stroną). */
  ruler?: boolean
  /** Ustaw kursor w treści zaraz po otwarciu. */
  autoFocus?: boolean
}

// ---------------------------------------------------------------------------
// Ochrona LaTeX-a przed parserem Markdown.
// Markdown traktuje `\{` jako ucieczkę i zamienia na `{`, a przy zapisie
// dokleja własne ukośniki — bez ochrony wzory typu \left\{ ulegają zniszczeniu.
// Rozwiązanie: w segmentach $...$ / $$...$$ przed parsowaniem uciekamy każdy
// znak interpunkcyjny (parser odtworzy oryginał), a po serializacji zdejmujemy
// wszystkie pary `\x` → `x` (serializator zawsze dubluje ukośniki).
// ---------------------------------------------------------------------------

const MATH_SEG = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g

const escapeMathForParse = (md: string) =>
  md.replace(MATH_SEG, (seg) => {
    const d = seg.startsWith('$$') ? 2 : 1
    const inner = seg.slice(d, -d)
    const delim = seg.slice(0, d)
    return delim + inner.replace(/[!-/:-@[-`{-~]/g, (c) => '\\' + c) + delim
  })

const unescapeMathAfterSerialize = (md: string) =>
  md.replace(MATH_SEG, (seg) => {
    const d = seg.startsWith('$$') ? 2 : 1
    const inner = seg.slice(d, -d)
    const delim = seg.slice(0, d)
    // serializator poza parami \x potrafi też zamienić <, > i & na encje HTML
    const clean = inner
      .replace(/\\([\s\S])/g, '$1')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
    return delim + clean + delim
  })

/** Tryb wizualny (à la Google Docs): rich text edytowany bezpośrednio,
 *  pod spodem zawsze Markdown+LaTeX. Wzory $...$ renderują się w miejscu
 *  (klik we wzór pokazuje jego kod). */
export function RichEditor({
  value,
  editable,
  onChange,
  ruler = true,
  autoFocus = false,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ paragraph: false }),
      BlankParagraph,
      MathRender,
      IndentRender,
      SizeRender,
      Markdown.configure({ html: false, linkify: false, breaks: false }),
    ],
    content: escapeMathForParse(value),
    editable,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      /** Zaznaczasz wzór, wciskasz `$` — i tekst jest w `$…$`, a nie
       *  skasowany. Zaznaczenie zostaje w środku, więc drugie naciśnięcie
       *  daje `$$…$$`. To samo dla pozostałych par znaków. */
      handleTextInput(view, from, to, text) {
        const right = OBEJMUJACE[text]
        if (!right || from === to) return false
        const wybrane = view.state.doc.textBetween(from, to, '\n')
        if (!wybrane) return false
        const tr = view.state.tr.insertText(`${text}${wybrane}${right}`, from, to)
        tr.setSelection(
          TextSelection.create(
            tr.doc,
            from + text.length,
            from + text.length + wybrane.length,
          ),
        )
        view.dispatch(tr)
        return true
      },
    },
    onUpdate: ({ editor }) => {
      onChange(unescapeMathAfterSerialize(editor.storage.markdown.getMarkdown()))
    },
  })

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editable, editor])

  // Firefox potrafi dorysować własne zielone uchwyty zmiany rozmiaru na
  // elementach w polu edycji — wyłączamy jego wbudowane edytowanie obiektów.
  useEffect(() => {
    try {
      document.execCommand('enableObjectResizing', false, 'false')
      document.execCommand('enableInlineTableEditing', false, 'false')
    } catch {
      // przeglądarki bez tych komend — nic do roboty
    }
  }, [editor])

  if (!editor) return null

  /** Wstawia parę `$…$` (albo `$$…$$`). Z zaznaczeniem obejmuje je, bez —
   *  wstawia samą parę i stawia kursor w środku, żeby od razu pisać wzór.
   *  Dawniej wchodziło tu literalne „x", które trzeba było najpierw skasować. */
  const wrapMath = (block: boolean) => {
    const { from, to } = editor.state.selection
    const sel = editor.state.doc.textBetween(from, to, ' ')
    const d = block ? '$$' : '$'
    editor
      .chain()
      .focus()
      .insertContent(`${d}${sel}${d}`)
      // kursor między znacznikami: przy pustym zaznaczeniu tuż w środku,
      // przy niepustym — obejmując wstawiony tekst
      .command(({ tr, dispatch }) => {
        const koniec = tr.selection.to
        const wewn = koniec - d.length
        if (dispatch) {
          tr.setSelection(TextSelection.create(tr.doc, sel ? wewn - sel.length : wewn, wewn))
        }
        return true
      })
      .run()
  }

  return (
    <div className="rich-editor">
      {editable && (
        <div className="rich-toolbar">
          <button
            className={`btn rich-btn ${editor.isActive('bold') ? 'btn-active' : ''}`}
            title="Pogrubienie (Ctrl+B)"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <b>B</b>
          </button>
          <button
            className={`btn rich-btn ${editor.isActive('italic') ? 'btn-active' : ''}`}
            title="Kursywa (Ctrl+I)"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <i>I</i>
          </button>
          <button
            className={`btn rich-btn ${
              editor.isActive('heading', { level: 2 }) ? 'btn-active' : ''
            }`}
            title="Nagłówek"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H
          </button>
          <select
            className="rich-size"
            title="Rozmiar zaznaczonego tekstu (zaznacz fragment i wybierz)"
            value={sizeAtSelection(editor) ?? ''}
            onChange={(e) => {
              applySizeToSelection(
                editor,
                e.target.value ? Number(e.target.value) : null,
              )
              editor.chain().focus().run()
            }}
          >
            <option value="">Aa</option>
            {SIZE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <button
            className={`btn rich-btn ${editor.isActive('bulletList') ? 'btn-active' : ''}`}
            title="Lista punktowana"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            ≔
          </button>
          <button
            className={`btn rich-btn ${editor.isActive('orderedList') ? 'btn-active' : ''}`}
            title="Lista numerowana"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1.
          </button>
          <button
            className={`btn rich-btn ${editor.isActive('blockquote') ? 'btn-active' : ''}`}
            title="Cytat"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            ❝
          </button>
          <button
            className="btn rich-btn"
            title="Wzór w tekście: $…$ (Ctrl+M w trybie kodu)"
            onClick={() => wrapMath(false)}
          >
            $x$
          </button>
          <button
            className="btn rich-btn"
            title="Wzór wystawiony: $$…$$"
            onClick={() => wrapMath(true)}
          >
            $$
          </button>
          <SpacingMenu />
        </div>
      )}
      {editable && ruler && <PageRuler editor={editor} />}
      <EditorContent editor={editor} className="rich-content markdown-body" />
    </div>
  )
}
