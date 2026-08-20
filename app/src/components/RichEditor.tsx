import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Paragraph from '@tiptap/extension-paragraph'
import { Markdown } from 'tiptap-markdown'
import katex from 'katex'
import { OBEJMUJACE } from '../cmShortcuts'
import { zachowajPusteLinie } from '../markdown'
import { PageRuler } from './PageRuler'
import { SpacingMenu } from './SpacingMenu'
import { INDENT_RE, INDENT_RE_ANY, indentStyle, parseIndents } from '../indent'
import {
  SIZE_MAX,
  SIZE_MIN,
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
/** Narysowane wzory z pamięcią.
 *
 *  Dekoracje przeliczają się przy KAŻDYM naciśnięciu klawisza, a razem z nimi
 *  rysował się od nowa każdy wzór w całym kafelku — przy długim dowodzie to
 *  było kilkaset milisekund na literę. Wzór zależy tylko od swojego LaTeX-a,
 *  więc wystarczy zapamiętać gotowy HTML. */
const pamiecWzorow = new Map<string, string>()
function zapamietanyWzor(tex: string, display: boolean, surowy: string): string {
  const klucz = `${display ? 'D' : 'i'}|${tex}`
  const gotowy = pamiecWzorow.get(klucz)
  if (gotowy !== undefined) return gotowy
  let html: string
  try {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false })
  } catch {
    // niepoprawny wzór pokazujemy tak, jak go napisano
    const div = document.createElement('div')
    div.textContent = surowy
    html = div.innerHTML
  }
  // pamięć bez dna zjadałaby ją przy tysiącach wzorów — starsze wypadają
  if (pamiecWzorow.size > 800) pamiecWzorow.delete(pamiecWzorow.keys().next().value!)
  pamiecWzorow.set(klucz, html)
  return html
}

const MathRender = Extension.create({
  name: 'mathRender',
  addProseMirrorPlugins() {
    /** Gotowe elementy wzorów tego edytora.
     *
     *  ProseMirror porównuje dekoracje-widżety po tożsamości elementu: jeśli
     *  oddamy TEN SAM element co poprzednio, nie przerysuje go. Bez tego każde
     *  naciśnięcie klawisza budowało od nowa wszystkie wzory w kafelku — przy
     *  długim dowodzie kilkaset elementów na literę.
     *
     *  Klucz zawiera numer wystąpienia, bo ten sam wzór bywa w tekście wiele
     *  razy, a jeden element nie może stać w dokumencie dwa razy. */
    const elementy = new Map<string, HTMLElement>()

    const build = (doc: import('@tiptap/pm/model').Node, selFrom: number, selTo: number) => {
      const decos: Decoration[] = []
      const ile = new Map<string, number>()
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
          const size = sizeAtPos(sizes, from)
          const baza = `${display ? 'D' : 'i'}|${size ?? ''}|${tex}`
          const nr = (ile.get(baza) ?? 0) + 1
          ile.set(baza, nr)
          const klucz = `${baza}|${nr}`
          let el = elementy.get(klucz)
          if (!el) {
            el = document.createElement(display ? 'div' : 'span')
            el.className = `math-render${display ? ' math-render-display' : ''}`
            if (size !== null) el.style.fontSize = `${size}px`
            el.innerHTML = zapamietanyWzor(tex, display, m[0])
            // pamięć bez dna zjadałaby ją przy ogromnych kafelkach
            if (elementy.size > 2000) elementy.clear()
            elementy.set(klucz, el)
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

/** Zaznaczenie widoczne także wtedy, gdy kursor wyszedł z pola.
 *
 *  Przeglądarka pokazuje podświetlenie tylko w elemencie, który ma kursor.
 *  Klikasz więc w pole rozmiaru albo w przycisk paska — i zaznaczony fragment
 *  przestaje być widoczny, chociaż wciąż jest zaznaczony i to jego dotyczy
 *  to, co za chwilę zrobisz. Rysujemy je wtedy sami. */
const ZamrozoneZaznaczenie = Extension.create({
  name: 'zamrozoneZaznaczenie',
  addProseMirrorPlugins() {
    let widok: EditorView | null = null
    return [
      new Plugin({
        key: new PluginKey('zamrozoneZaznaczenie'),
        props: {
          decorations(state) {
            const { from, to, empty } = state.selection
            if (empty || !widok || widok.hasFocus()) return null
            return DecorationSet.create(state.doc, [
              Decoration.inline(from, to, { class: 'sel-zamrozone' }),
            ])
          },
        },
        view(v) {
          widok = v
          // samo wyjście kursora nie jest zmianą stanu, więc trzeba poprosić
          // o przerysowanie dekoracji
          const odswiez = () => v.dispatch(v.state.tr.setMeta('zamrozone', Date.now()))
          v.dom.addEventListener('blur', odswiez)
          v.dom.addEventListener('focus', odswiez)
          return {
            destroy() {
              v.dom.removeEventListener('blur', odswiez)
              v.dom.removeEventListener('focus', odswiez)
              widok = null
            },
          }
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
          // Pusty kafelek albo puste linie na końcu to nie „odstęp", tylko brak
          // treści — inaczej każdy nowy kafelek zaczynałby się od &nbsp;.
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

/** Rozmiar tekstu: pokazuje liczbę, a nie „Aa".
 *
 *  Trzy rzeczy naraz. Widać, ile ten tekst ma teraz — a gdy nic nie ustawiono,
 *  widać rozmiar podstawowy odczytany z pola, więc liczba zawsze coś znaczy.
 *  Lista podpowiada rozmiary co jeden punkt. A wpisać można dowolną liczbę,
 *  bo żadna lista nie zgadnie wszystkiego. */
function PoleRozmiaru({ editor }: { editor: Editor }) {
  const teraz = sizeAtSelection(editor)
  const [bazowy, setBazowy] = useState<number | null>(null)
  useEffect(() => {
    const el = editor.view.dom as HTMLElement
    const px = parseFloat(getComputedStyle(el).fontSize)
    if (px) setBazowy(Math.round(px))
  }, [editor])
  const pokazywane = String(teraz ?? bazowy ?? '')
  const [wpis, setWpis] = useState(pokazywane)
  const [pisze, setPisze] = useState(false)
  /** To samo, tylko do odczytania w obsłudze zdarzeń, które przychodzą po
   *  zatwierdzeniu — inaczej opuszczenie pola zatwierdzałoby je drugi raz,
   *  i to wartością, która zdążyła się już podmienić. */
  const piszeRef = useRef(false)
  if (!pisze && wpis !== pokazywane) setWpis(pokazywane)

  const zatwierdz = (raw: string) => {
    setPisze(false)
    piszeRef.current = false
    const t = raw.trim()
    if (t === '') {
      applySizeToSelection(editor, null)
    } else {
      const n = Math.round(Number(t))
      if (Number.isFinite(n) && n > 0) {
        applySizeToSelection(editor, Math.min(SIZE_MAX, Math.max(SIZE_MIN, n)))
      }
    }
    editor.chain().focus().run()
  }

  return (
    <>
      <input
        className="rich-size"
        list="rozmiary-tekstu"
        inputMode="numeric"
        /* Kliknięcie w pole zabierało zaznaczenie tekstu — a przecież to
           właśnie zaznaczony fragment ma zmienić rozmiar. Nie oddajemy więc
           kursora: pole samo się skupia, a podświetlenie zostaje. */
        onMouseDown={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLInputElement).focus({ preventScroll: true })
          ;(e.currentTarget as HTMLInputElement).select()
        }}
        title="Rozmiar zaznaczonego tekstu — wybierz z listy albo wpisz własny; puste pole przywraca rozmiar podstawowy"
        value={wpis}
        onChange={(e) => {
          setPisze(true)
          piszeRef.current = true
          setWpis(e.target.value)
          // wybór z listy podpowiedzi zatwierdzamy od razu
          if (SIZE_OPTIONS.includes(Number(e.target.value))) zatwierdz(e.target.value)
        }}
        onBlur={(e) => {
          if (piszeRef.current) zatwierdz(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            zatwierdz((e.target as HTMLInputElement).value)
          }
          if (e.key === 'Escape') {
            setPisze(false)
            piszeRef.current = false
            setWpis(pokazywane)
          }
        }}
      />
      <datalist id="rozmiary-tekstu">
        {SIZE_OPTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </>
  )
}

/** Pasek narzędzi edytora. Osobno, bo w ścieżce jeden pasek obsługuje
 *  wszystkie kafelki naraz — działa na tym polu, w którym stoi kursor. */
export function RichToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return <div className="rich-toolbar rich-toolbar-pusty" />

  /** Wstawia parę dolarów. Z zaznaczeniem obejmuje je, bez — wstawia samą
   *  parę i stawia kursor w środku, żeby od razu pisać wzór. */
  const wrapMath = (block: boolean) => {
    const { from, to } = editor.state.selection
    const sel = editor.state.doc.textBetween(from, to, ' ')
    const d = block ? '$$' : '$'
    editor
      .chain()
      .focus()
      .insertContent(`${d}${sel}${d}`)
      .command(({ tr, dispatch }) => {
        const koniec = tr.selection.to
        const wewn = koniec - d.length
        if (dispatch) {
          tr.setSelection(
            TextSelection.create(tr.doc, sel ? wewn - sel.length : wewn, wewn),
          )
        }
        return true
      })
      .run()
  }

  return (
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
      <PoleRozmiaru editor={editor} />
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
  )
}

interface Props {
  /** Treść w Markdownie (źródło prawdy) — wczytywana raz przy montowaniu;
   *  komponent montuj z key={id wersji}, żeby zmiana kafelka przeładowała treść. */
  value: string
  editable: boolean
  onChange: (markdown: string) => void
  /** Linijka szerokości strony — tylko tam, gdzie treść jest „stroną"
   *  (w oknie notatki nie ma sensu, bo okno nie jest stroną). */
  ruler?: boolean
  /** Ustaw kursor w treści zaraz po otwarciu. */
  autoFocus?: boolean
  /** Bez własnego paska narzędzi — używane tam, gdzie pasek jest jeden
   *  wspólny dla wielu pól (ścieżka w widoku Linia). */
  bezPaska?: boolean
  /** Daje edytor na zewnątrz, żeby wspólny pasek wiedział, na czym działa. */
  onReady?: (editor: Editor | null) => void
  /** Wołane po wejściu kursora w to pole — wspólny pasek przełącza się na nie. */
  onFocus?: () => void
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

/** Markdown bez „kodu przez wcięcie".
 *
 *  Reguła musi zniknąć, ZANIM treść zostanie sparsowana — a to dzieje się
 *  już przy tworzeniu edytora. Hak w onCreate (a nawet onBeforeCreate) jest
 *  za późny: pierwszy akapit zdążył wtedy stać się szarą ramką. Magazyn
 *  rozszerzenia powstaje wcześniej, więc wyłączamy ją właśnie tutaj. */
const MarkdownBezWciec = Markdown.extend({
  addStorage() {
    const magazyn = this.parent?.()
    try {
      const md = (magazyn as { parser?: { md?: { disable?: (r: string) => void } } })
        ?.parser?.md
      md?.disable?.('code')
    } catch {
      /* inna wersja biblioteki — reszta i tak działa */
    }
    return magazyn
  },
})


/** Backslashe POZA wzorami.
 *
 *  Serializator Markdowna zabezpiecza znak ucieczki: pisząc w treści
 *  `\mathcal{A}` (a nie we wzorze) dostawało się w zapisie
 *  `\\mathcal{A}`. W notatkach z matematyki backslash to prawie zawsze
 *  LaTeX, a nie ucieczka Markdowna, więc go przywracamy.
 *
 *  Z pominięciem kodu — tam `\\` bywa naprawdę dwoma backslashami
 *  i nie nam go poprawiać. */
const KOD_MD = /(```[\s\S]*?```|`[^`\n]*`)/g
const przywrocBackslashe = (md: string) =>
  md
    .split(KOD_MD)
    .map((cz, i) => (i % 2 ? cz : cz.replace(/\\\\/g, '\\')))
    .join('')

/** Tryb wizualny (à la Google Docs): rich text edytowany bezpośrednio,
 *  pod spodem zawsze Markdown+LaTeX. Wzory $...$ renderują się w miejscu
 *  (klik we wzór pokazuje jego kod). */
export function RichEditor({
  value,
  editable,
  onChange,
  ruler = true,
  autoFocus = false,
  bezPaska = false,
  onReady,
  onFocus,
}: Props) {
  const editor = useEditor({
    extensions: [
      // Bez bloków kodu.
      //
      // Markdown robi szarą ramkę z kodem z każdego akapitu wciętego
      // o cztery spacje. W notatkach z matematyki to plaga: wcięte zdanie
      // albo punkt listy nagle zmienia się w tekst maszynowy w ramce,
      // a LaTeX przestaje być LaTeX-em. Wyłączenia samej reguły parsera
      // nie da się tu dosięgnąć na czas (treść jest parsowana już przy
      // tworzeniu edytora), więc znika cały rodzaj bloku.
      //
      // Cena: blok pisany wprost przez ``` po dotknięciu w widoku
      // wizualnym staje się kodem „w linii". Treść zostaje w całości —
      // zmienia się tylko sposób pokazania. W notatkach z matematyki to
      // uczciwa zamiana za brak ramek, które robią się same.
      StarterKit.configure({ paragraph: false, codeBlock: false }),
      BlankParagraph,
      MathRender,
      IndentRender,
      SizeRender,
      ZamrozoneZaznaczenie,
      MarkdownBezWciec.configure({ html: false, linkify: false, breaks: false }),
    ],
    // puste linijki wpisane w trybie kodu też mają być widoczne w edytorze
    // Parser Markdownu w edytorze ma własną regułę „kod przez wcięcie" —
    // ta sama, ktora w podgladzie juz wylaczylismy. Bez tego wciety akapit
    // dalej zmienialby sie w szara ramke, tyle ze tylko w edytorze.
    content: escapeMathForParse(zachowajPusteLinie(value)),
    editable,
    autofocus: autoFocus ? 'end' : false,
    onFocus: () => onFocus?.(),
    onBlur: () => oddajTeraz(),
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
      oddajPozniej(editor)
    },
  })

  /** Przepisanie treści na Markdown z małym opóźnieniem.
   *
   *  Serializacja przepuszcza CAŁY dokument — przy długim dowodzie to
   *  kilkanaście milisekund na każdą literę, a nikt tego wyniku w trakcie
   *  pisania nie ogląda. Wystarczy raz na chwilę ciszy; przy opuszczeniu pola
   *  i przy zamknięciu edytora oddajemy natychmiast, żeby nic nie przepadło. */
  const oddajRef = useRef<{ t: number; ed: Editor } | null>(null)
  const oddajTeraz = () => {
    const czeka = oddajRef.current
    if (!czeka) return
    window.clearTimeout(czeka.t)
    oddajRef.current = null
    onChange(
      przywrocBackslashe(unescapeMathAfterSerialize(czeka.ed.storage.markdown.getMarkdown())),
    )
  }
  const oddajPozniej = (ed: Editor) => {
    if (oddajRef.current) window.clearTimeout(oddajRef.current.t)
    oddajRef.current = { ed, t: window.setTimeout(oddajTeraz, 220) }
  }
  useEffect(() => () => oddajTeraz(), [])

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editable, editor])

  // wspólny pasek narzędzi musi wiedzieć, na czym działa
  useEffect(() => {
    onReady?.(editor)
    return () => onReady?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

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

  return (
    <div className="rich-editor">
      {editable && !bezPaska && <RichToolbar editor={editor} />}
      {editable && ruler && <PageRuler editor={editor} />}
      <EditorContent editor={editor} className="rich-content markdown-body" />
    </div>
  )
}
