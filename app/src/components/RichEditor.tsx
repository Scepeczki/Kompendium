import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import katex from 'katex'
import { PageRuler } from './PageRuler'
import { SpacingMenu } from './SpacingMenu'
import { INDENT_RE, INDENT_RE_ANY, indentStyle, parseIndents } from '../indent'

/** Renderuje wzory $...$ i $$...$$ w miejscu (dekoracje nad tekstem).
 *  Tekst w dokumencie pozostaje czystym LaTeX-em (bezpieczny Markdown);
 *  gdy kursor wejdzie we wzór, widać jego kod — jak w dobrym Overleafie. */
const MathRender = Extension.create({
  name: 'mathRender',
  addProseMirrorPlugins() {
    const build = (doc: import('@tiptap/pm/model').Node, selFrom: number, selTo: number) => {
      const decos: Decoration[] = []
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

interface Props {
  /** Treść w Markdownie (źródło prawdy) — wczytywana raz przy montowaniu;
   *  komponent montuj z key={id wersji}, żeby zmiana klocka przeładowała treść. */
  value: string
  editable: boolean
  onChange: (markdown: string) => void
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
export function RichEditor({ value, editable, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      MathRender,
      IndentRender,
      Markdown.configure({ html: false, linkify: false, breaks: false }),
    ],
    content: escapeMathForParse(value),
    editable,
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

  const wrapMath = (block: boolean) => {
    const { from, to } = editor.state.selection
    const sel = editor.state.doc.textBetween(from, to, ' ')
    const d = block ? '$$' : '$'
    editor
      .chain()
      .focus()
      .insertContent(`${d}${sel || 'x'}${d}`)
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
      {editable && <PageRuler editor={editor} />}
      <EditorContent editor={editor} className="rich-content markdown-body" />
    </div>
  )
}
