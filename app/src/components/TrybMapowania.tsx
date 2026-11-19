import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { db, mainPageName } from '../db'
import { useBlockTypes } from '../blockTypes'
import { renderMarkdown } from '../markdown'
import { topoOrder } from '../topo'
import { useDialogs } from './Dialogs'
import { Icon } from './Icon'
import { PoleRozmiaru, RichEditor, obrazyZ, wstawObrazy } from './RichEditor'
import {
  ileLuk,
  kluczZadania,
  ocenialny,
  przerwijDouczanie,
  przerwijNauke,
  skonczMapowanie,
  skonczMapowanieDouczania,
  zapiszMapeKafelka,
  zmienJednostke,
} from '../nauka'
import { pytania, sciaga, zasady } from '../naukaUstawienia'
import {
  kluczWlasnej,
  type BlockVersion,
  type Concept,
  type JednostkaNauki,
  type LearningPath,
  type PathNode,
  type Subpage,
} from '../types'

// ---------------------------------------------------------------------------
// Wspólne drobiazgi

/** Markdown z wzorami liczy się raz na tekst. */
const pamiecHtml = new Map<string, string>()
function html(md: string): string {
  let h = pamiecHtml.get(md)
  if (h === undefined) {
    h = renderMarkdown(md)
    if (pamiecHtml.size > 1500) pamiecHtml.clear()
    pamiecHtml.set(md, h)
  }
  return h
}

/** Punkt ściągi jako nagłówek: bez dopowiedzeń w nawiasach. */
const tytulPunktu = (p: string) => p.replace(/\s*\([^)]*\)/g, '').replace(/\s+,/g, ',').trim()

/** Czy klik padł poza element — do zamykania okienek. */
function useZamknijPozaKlikiem(otwarte: boolean, ref: React.RefObject<HTMLElement | null>, zamknij: () => void) {
  useEffect(() => {
    if (!otwarte) return
    const klik = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) zamknij()
    }
    const klawisz = (e: KeyboardEvent) => e.key === 'Escape' && zamknij()
    window.addEventListener('mousedown', klik)
    window.addEventListener('keydown', klawisz)
    return () => {
      window.removeEventListener('mousedown', klik)
      window.removeEventListener('keydown', klawisz)
    }
  }, [otwarte, ref, zamknij])
}

// ---------------------------------------------------------------------------
// Ściąga — schowana pod żarówką

/** Ściąga do mapowania: punkty mapy, cel nauki i krótkie zasady. Normalnie
 *  jej nie widać — rozwija się z ikony. Klik w punkt wstawia go do mapy. */
export function Sciaga({ onWstaw, wPanelu }: { onWstaw?: (punkt: string) => void; wPanelu?: boolean }) {
  const [otwarta, setOtwarta] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useZamknijPozaKlikiem(otwarta, ref, () => setOtwarta(false))
  return (
    <div className={`sciaga ${wPanelu ? 'sciaga-w-panelu' : ''}`} ref={ref}>
      <button
        className={`tm-ikona ${otwarta ? 'wl' : ''}`}
        aria-label="Ściąga do mapowania"
        title="Ściąga do mapowania"
        aria-expanded={otwarta}
        onClick={() => setOtwarta((o) => !o)}
      >
        <Icon name="lightbulb" size={1.15} />
      </button>
      {otwarta && (
        <div className="sciaga-okno" role="dialog" aria-label="Ściąga do mapowania">
          <span className="tm-etykieta">Przy mapowaniu</span>
          <div className="sciaga-punkty">
            {sciaga().map((p) =>
              onWstaw ? (
                <button key={p} className="sciaga-punkt" onClick={() => onWstaw(p)} title="Wstaw jako nagłówek w mapie">
                  {p}
                </button>
              ) : (
                <span key={p} className="sciaga-punkt">
                  {p}
                </span>
              ),
            )}
          </div>
          <span className="tm-etykieta">Kto się nauczył, potrafi</span>
          <ul className="sciaga-cel">
            {pytania().map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <details className="sciaga-zasady">
            <summary>Jak mapować</summary>
            <ul>
              {zasady().map((z) => (
                <li key={z}>{z}</li>
              ))}
            </ul>
          </details>
          <span className="sciaga-stopka">
            {onWstaw ? 'Klik w punkt wstawia go do mapy jako nagłówek. ' : ''}Listy zmienisz w Ustawieniach → Nauka.
          </span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Edytor mapy: kartka z porządnym paskiem narzędzi

/** Pasek narzędzi mapy — jak w edytorze dokumentów: cofnij, styl akapitu,
 *  rozmiar, pogrubienie, listy, wzór, zdjęcie, luka, odnośnik, sekcja. */
function PasekMapy({ editor }: { editor: Editor | null }) {
  const [, odswiez] = useState(0)
  const [sekcje, setSekcje] = useState(false)
  const sekcjeRef = useRef<HTMLDivElement>(null)
  useZamknijPozaKlikiem(sekcje, sekcjeRef, () => setSekcje(false))
  useEffect(() => {
    if (!editor) return
    const f = () => odswiez((x) => x + 1)
    editor.on('transaction', f)
    return () => {
      editor.off('transaction', f)
    }
  }, [editor])
  if (!editor) return <div className="tm-pasek tm-pasek-pusty" />

  const ch = () => editor.chain().focus()
  const styl = editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'
  const wzor = (blok: boolean) => {
    const { from, to } = editor.state.selection
    const sel = editor.state.doc.textBetween(from, to, ' ')
    const d = blok ? '$$' : '$'
    ch()
      .insertContent(`${d}${sel}${d}`)
      .command(({ tr, dispatch }) => {
        const wewn = tr.selection.to - d.length
        if (dispatch) tr.setSelection(TextSelection.create(tr.doc, sel ? wewn - sel.length : wewn, wewn))
        return true
      })
      .run()
  }
  const przycisk = (
    etykieta: React.ReactNode,
    tytul: string,
    akcja: () => void,
    aktywny = false,
    klasa = '',
  ) => (
    <button
      className={`tm-tb ${aktywny ? 'wl' : ''} ${klasa}`}
      title={tytul}
      aria-label={tytul}
      aria-pressed={aktywny || undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={akcja}
    >
      {etykieta}
    </button>
  )

  return (
    <div className="tm-pasek" role="toolbar" aria-label="Edytor mapy">
      {przycisk('↶', 'Cofnij (Ctrl+Z)', () => ch().undo().run())}
      {przycisk('↷', 'Ponów (Ctrl+Y)', () => ch().redo().run())}
      <span className="tm-sep" />
      <select
        className="tm-styl"
        aria-label="Styl akapitu"
        value={styl}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'p') ch().setParagraph().run()
          else ch().setHeading({ level: v === 'h2' ? 2 : 3 }).run()
        }}
      >
        <option value="p">Zwykły tekst</option>
        <option value="h2">Nagłówek</option>
        <option value="h3">Podtytuł</option>
      </select>
      <span className="tm-sep" />
      <PoleRozmiaru editor={editor} />
      <span className="tm-sep" />
      {przycisk(<b>B</b>, 'Pogrubienie (Ctrl+B)', () => ch().toggleBold().run(), editor.isActive('bold'))}
      {przycisk(<i className="tm-i">I</i>, 'Kursywa (Ctrl+I)', () => ch().toggleItalic().run(), editor.isActive('italic'))}
      {przycisk(<s>S</s>, 'Przekreślenie', () => ch().toggleStrike().run(), editor.isActive('strike'))}
      <span className="tm-sep" />
      {przycisk('•≡', 'Lista punktowana', () => ch().toggleBulletList().run(), editor.isActive('bulletList'))}
      {przycisk('1≡', 'Lista numerowana', () => ch().toggleOrderedList().run(), editor.isActive('orderedList'))}
      {przycisk('❝', 'Cytat', () => ch().toggleBlockquote().run(), editor.isActive('blockquote'))}
      <span className="tm-sep" />
      {przycisk(<span className="tm-i">∑ wzór</span>, 'Wzór w tekście: $…$', () => wzor(false))}
      {przycisk(<span className="tm-i">$$</span>, 'Wzór wystawiony: $$…$$', () => wzor(true))}
      <label className="tm-tb" title="Wstaw zdjęcie (albo wklej Ctrl+V, upuść w tekście)" aria-label="Wstaw zdjęcie">
        <Icon name="zdjecie" size={1.05} />
        <input
          className="rich-plik"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            void wstawObrazy(editor, obrazyZ(e.target.files))
            e.target.value = ''
          }}
        />
      </label>
      {przycisk('?? luka', 'Luka: miejsce, którego jeszcze nie wiesz', () => ch().insertContent('?? ').run(), false, 'tm-tb-luka')}
      {przycisk('↗ link', 'Odnośnik do kafelka: [[nazwa]]', () => ch().insertContent('[[').run())}
      <span className="tm-sep" />
      <div className="tm-sekcje" ref={sekcjeRef}>
        <button
          className={`tm-tb tm-tb-ramka ${sekcje ? 'wl' : ''}`}
          aria-expanded={sekcje}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setSekcje((s) => !s)}
        >
          Wstaw sekcję ▾
        </button>
        {sekcje && (
          <div className="tm-sekcje-menu" role="menu">
            {sciaga().map((p) => (
              <button
                key={p}
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSekcje(false)
                  wstawSekcje(editor, p)
                }}
              >
                {tytulPunktu(p)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Wstawia punkt ściągi jako podtytuł z pustym akapitem pod spodem. */
function wstawSekcje(editor: Editor, punkt: string) {
  editor
    .chain()
    .focus()
    .insertContent([
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: tytulPunktu(punkt) }] },
      { type: 'paragraph' },
    ])
    .run()
}

/** Kartka mapy: nagłówek z nazwą i edytor bez własnego paska. */
function KartkaMapy({
  klucz,
  etykieta,
  tytul,
  typ,
  wartosc,
  onZmiana,
  onEdytor,
  placeholder,
}: {
  klucz: string
  etykieta: string
  tytul: string
  typ?: React.ReactNode
  wartosc: string
  onZmiana: (md: string) => void
  onEdytor: (e: Editor | null) => void
  placeholder: string
}) {
  const [zapis, setZapis] = useState<'zapisano' | 'pisze'>('zapisano')
  const czas = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(czas.current), [])
  return (
    <section className="tm-kartka" aria-label={`${etykieta}: ${tytul}`}>
      <div className="tm-kartka-glowa">
        <span className="tm-etykieta tm-etykieta-akcent">{etykieta}</span>
        {typ}
        <b>{tytul}</b>
        <span className="tm-zapis">{zapis === 'zapisano' ? 'zapisano' : 'zapisuję…'}</span>
      </div>
      <div className="tm-kartka-tresc">
        <RichEditor
          key={klucz}
          value={wartosc}
          editable
          ruler={false}
          bezPaska
          luki
          placeholder={placeholder}
          onReady={onEdytor}
          onChange={(md) => {
            setZapis('pisze')
            onZmiana(md)
            window.clearTimeout(czas.current)
            czas.current = window.setTimeout(() => setZapis('zapisano'), 600)
          }}
        />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Elementy sektora

interface Element {
  klucz: string
  nazwa: string
  typ?: string
  conceptId?: string
  versionId?: string | null
  /** Strona pokazywana bazowo w ścieżce. */
  subpageId?: string | null
  wlasne?: Record<string, string>
  /** Treść grupy (bez osobnego kafelka). */
  tresc?: string
  zadanie?: boolean
}

function elementy(j: JednostkaNauki, sciezka: LearningPath | undefined, kafelek: Map<string, Concept>): Element[] {
  const out: Element[] = []
  const tylko = j.douczanie ? new Set(j.douczanie.wezly) : null
  if (sciezka) {
    const nale = new Set(j.wezly)
    for (const n of topoOrder(sciezka.nodes, sciezka.edges)) {
      if (!nale.has(n.id) || !ocenialny(n)) continue
      if (tylko && !tylko.has(n.id)) continue
      if (n.kind === 'block') {
        const c = kafelek.get(n.conceptId)
        out.push({
          klucz: n.id,
          nazwa: n.nazwa ?? c?.name ?? 'kafelek',
          typ: c?.type,
          conceptId: n.conceptId,
          versionId: n.versionId,
          subpageId: n.subpageId ?? null,
          wlasne: n.wlasneTresci,
        })
      } else if (n.kind === 'fusion') {
        out.push({ klucz: n.id, nazwa: n.name || 'grupa', typ: n.type, tresc: n.content })
      }
    }
  }
  for (const id of j.douczanie ? j.douczanie.zadania : (j.zadania ?? [])) {
    const c = kafelek.get(id)
    if (c) out.push({ klucz: kluczZadania(id), nazwa: c.name, typ: c.type, conceptId: id, versionId: null, zadanie: true })
  }
  return out
}

/** Stan mapy kafelka: pusta, z lukami albo gotowa. */
function stanMapy(md: string | undefined): { rodzaj: 'pusta' | 'luki' | 'gotowa'; luk: number } {
  if (!md?.trim()) return { rodzaj: 'pusta', luk: 0 }
  const luk = ileLuk(md)
  return luk ? { rodzaj: 'luki', luk } : { rodzaj: 'gotowa', luk: 0 }
}

/** Ustawienie trzymane w przeglądarce — bez niego wszystko działa dalej. */
function czytaj(klucz: string): string | null {
  try {
    return localStorage.getItem(klucz)
  } catch {
    return null
  }
}
function zapisz(klucz: string, wartosc: string) {
  try {
    localStorage.setItem(klucz, wartosc)
  } catch {
    // prywatne okno — ustawienie nie przetrwa, ale nic się nie psuje
  }
}

const KLUCZ_ZAKRYTE = 'ui.nauka.zakryte'
const KLUCZ_ZWINIETE = 'ui.nauka.zwinieteMapy'

/** Mapy zwinięte w Przeglądzie — wybór zostaje, dopóki go nie zmienisz. */
function useZwiniete() {
  const [zw, setZw] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(czytaj(KLUCZ_ZWINIETE) ?? '[]') as string[])
    } catch {
      return new Set()
    }
  })
  const ustaw = (klucze: string[], zwin: boolean) =>
    setZw((s) => {
      const n = new Set(s)
      for (const k of klucze) {
        if (zwin) n.add(k)
        else n.delete(k)
      }
      zapisz(KLUCZ_ZWINIETE, JSON.stringify([...n]))
      return n
    })
  return { zw, ustaw }
}

/** Zwinięta mapa: pierwsze linijki tekstu, zdjęcie jako słowo. */
function skrot(md: string): string {
  const linie = md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[zdjęcie]')
    .replace(/[#>*_`]/g, '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
  const t = linie.slice(0, 2).join(' · ')
  return t.length > 140 ? t.slice(0, 140) + '…' : t
}

const opisLuk = (n: number) => `?? ${n} ${n === 1 ? 'luka' : n < 5 ? 'luki' : 'luk'}`

// ---------------------------------------------------------------------------
// Tryb mapowania

type Strona = 'kafelki' | 'calosc' | 'przeglad'
type Szuflada = null | 'sciezka' | 'biblioteka'

/** Tryb mapowania — okno na cały ekran, w którym mapuje się sektor.
 *
 *  Środek to praca: źródło kafelka obok jego mapy, potem mapa całego
 *  sektora i przegląd przed końcem. Z lewej szuflady tylko do podglądu —
 *  ścieżka (Linia albo Nauka, dowolna ścieżka) i biblioteka — bo spójna
 *  mapa często potrzebuje wcześniejszej wiedzy. Ściąga chowa się pod
 *  żarówką. */
export function TrybMapowania({ j, onZamknij }: { j: JednostkaNauki; onZamknij: () => void }) {
  const dlg = useDialogs()
  const typy = useBlockTypes()
  const sciezka = useLiveQuery(() => (j.pathId ? db.paths.get(j.pathId) : undefined), [j.pathId])
  const ids = useMemo(() => {
    const s = new Set<string>()
    for (const n of sciezka?.nodes ?? []) {
      if (!j.wezly.includes(n.id)) continue
      if (n.kind === 'block') s.add(n.conceptId)
    }
    for (const z of j.zadania ?? []) s.add(z)
    return [...s].sort()
  }, [sciezka, j.wezly, j.zadania])
  const dane = useLiveQuery(async () => {
    const [cs, vs, sp] = await Promise.all([
      db.concepts.where('id').anyOf(ids).toArray(),
      db.versions.where('conceptId').anyOf(ids).toArray(),
      db.subpages.where('conceptId').anyOf(ids).toArray(),
    ])
    return { cs, vs, sp }
  }, [ids.join()])
  const kafelek = useMemo(() => new Map((dane?.cs ?? []).map((c) => [c.id, c])), [dane])
  const lista = useMemo(() => elementy(j, sciezka, kafelek), [j, sciezka, kafelek])

  const [strona, setStrona] = useState<Strona>('kafelki')
  const [nr, setNr] = useState(0)
  const [szuflada, setSzuflada] = useState<Szuflada>(null)
  const [edytor, setEdytor] = useState<Editor | null>(null)
  const [zakryte, setZakryte] = useState(() => czytaj(KLUCZ_ZAKRYTE) === '1')
  const zmienZakryte = (z: boolean) => {
    setZakryte(z)
    zapisz(KLUCZ_ZAKRYTE, z ? '1' : '0')
  }
  const { zw, ustaw: ustawZwiniete } = useZwiniete()
  const kluczZw = (k: string) => `${j.id}:${k}`
  const kluczeKafelkow = lista.map((e) => kluczZw(e.klucz))
  const wszystkieZwiniete = kluczeKafelkow.length > 0 && kluczeKafelkow.every((k) => zw.has(k))
  const [, setTik] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setTik((x) => x + 1), 30000)
    return () => window.clearInterval(t)
  }, [])
  // bez kafelków nie ma czego mapować po kolei — od razu całość
  useEffect(() => {
    if (dane && lista.length === 0 && strona === 'kafelki') setStrona('calosc')
  }, [dane, lista.length, strona])
  const biezacy = lista[Math.min(nr, lista.length - 1)]

  const mapuje = j.etap === 'mapowanie' || j.douczanie?.etap === 'mapowanie'
  const od = j.douczanie?.etap === 'mapowanie' ? j.douczanie.od : j.etap === 'mapowanie' ? j.etapOd : undefined
  const minut = od ? Math.max(0, Math.round((Date.now() - new Date(od).getTime()) / 60000)) : 0
  const doPoprawy = new Set(j.doPoprawy ?? [])
  const typMini = (typ?: string) => {
    if (!typ) return null
    const def = typy.def(typ)
    return (
      <span className="type-mini" data-typ={def.id} style={typy.style(def.id)}>
        {def.short}
      </span>
    )
  }

  const skoncz = async () => {
    if (j.douczanie?.etap === 'mapowanie') await skonczMapowanieDouczania(j.id)
    else await skonczMapowanie(j.id)
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
    onZamknij()
  }
  const przerwij = async () => {
    const ok = await dlg.confirm({
      title: `Przerwać ${j.douczanie ? 'douczanie' : 'naukę'} „${j.nazwa}"?`,
      message: 'Nic nie zostanie zaliczone. Mapy zostają — możesz wrócić, kiedy zechcesz.',
      confirmLabel: 'Przerwij',
      cancelLabel: 'Mapuję dalej',
    })
    if (!ok) return
    if (j.douczanie) await przerwijDouczanie(j.id)
    else await przerwijNauke(j.id)
    onZamknij()
  }
  const doMapy = (nazwa: string) => {
    edytor?.chain().focus().insertContent(`[[${nazwa}]] `).run()
  }

  const strony: { id: Strona; nazwa: string }[] = [
    ...(lista.length ? [{ id: 'kafelki' as const, nazwa: `Kafelki · ${Math.min(nr + 1, lista.length)}/${lista.length}` }] : []),
    { id: 'calosc', nazwa: 'Całość sektora' },
    { id: 'przeglad', nazwa: 'Przegląd' },
  ]

  return createPortal(
    <div className="tm" role="dialog" aria-label={`Tryb mapowania: ${j.nazwa}`} style={{ '--sektor': j.kolor ?? '#e07a5f' } as React.CSSProperties}>
      <header className="tm-glowa">
        <span className="tm-plakietka">
          <span className="tm-kropka" />
          {j.douczanie ? 'Douczanie' : mapuje ? 'Mapowanie' : 'Mapa'} · {j.nazwa}
        </span>
        <span className="tm-sciezka">{sciezka?.name}</span>
        <nav className="tm-strony" aria-label="Strony mapowania">
          <span className="tm-zakladki">
            {strony.map((s) => (
              <button
                key={s.id}
                className={`tm-zakladka ${strona === s.id ? 'wl' : ''}`}
                aria-current={strona === s.id ? 'page' : undefined}
                onClick={() => setStrona(s.id)}
              >
                {s.nazwa}
              </button>
            ))}
          </span>
        </nav>
        {od && (
          <span className="tm-czas">
            od {new Date(od).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })} · {minut} min
          </span>
        )}
        <Sciaga onWstaw={edytor ? (p) => wstawSekcje(edytor, p) : undefined} />
        {mapuje && (
          <>
            <button className="tm-btn" onClick={przerwij} title="Nic nie zostanie zaliczone; mapy zostają">
              Przerwij
            </button>
            <button className="tm-btn tm-btn-glowny" onClick={skoncz}>
              Skończyłem mapowanie
            </button>
          </>
        )}
        <button className="tm-ikona" onClick={onZamknij} aria-label="Schowaj tryb mapowania" title="Schowaj — wrócisz przyciskiem „Mapuj” w panelu Nauki">
          ✕
        </button>
      </header>

      <div className="tm-cialo">
        <nav className="tm-szyna" aria-label="Podgląd poza sektorem">
          <button
            className={`tm-szyna-btn ${szuflada === 'sciezka' ? 'wl' : ''}`}
            aria-pressed={szuflada === 'sciezka'}
            onClick={() => setSzuflada((s) => (s === 'sciezka' ? null : 'sciezka'))}
          >
            <Icon name="sciezka" size={1.15} />
            Ścieżka
          </button>
          <button
            className={`tm-szyna-btn ${szuflada === 'biblioteka' ? 'wl' : ''}`}
            aria-pressed={szuflada === 'biblioteka'}
            onClick={() => setSzuflada((s) => (s === 'biblioteka' ? null : 'biblioteka'))}
          >
            <Icon name="library" size={1.15} />
            Biblioteka
          </button>
          <span className="tm-szyna-pusto" />
          <span className="tm-szyna-opis">
            tylko
            <br />
            podgląd
          </span>
        </nav>

        {szuflada && (
          <aside className="tm-szuflada" aria-label={szuflada === 'sciezka' ? 'Podgląd ścieżki' : 'Biblioteka'}>
            {szuflada === 'sciezka' ? (
              <PodgladSciezki
                startPathId={j.pathId}
                mapowane={new Set(j.wezly)}
                onDoMapy={edytor ? doMapy : undefined}
                onZamknij={() => setSzuflada(null)}
              />
            ) : (
              <PodgladBiblioteki onDoMapy={edytor ? doMapy : undefined} onZamknij={() => setSzuflada(null)} />
            )}
          </aside>
        )}

        {strona === 'kafelki' && biezacy && (
          <>
            <nav className="tm-lista" aria-label="Kafelki sektora">
              <span className="tm-etykieta">{j.douczanie ? 'Nowe w sektorze' : 'Kafelki'}</span>
              {lista.map((e, i) => {
                const st = stanMapy(j.mapyKafelkow?.[e.klucz])
                return (
                  <button
                    key={e.klucz}
                    className={`tm-lista-poz ${i === nr ? 'wl' : ''}`}
                    aria-current={i === nr ? 'step' : undefined}
                    onClick={() => setNr(i)}
                  >
                    <span className={`tm-kolko ${st.rodzaj === 'gotowa' ? 'gotowe' : i === nr ? 'biezace' : ''}`}>
                      {st.rodzaj === 'gotowa' ? '✓' : i + 1}
                    </span>
                    <span className="tm-lista-nazwa">
                      {e.nazwa}
                      {e.zadanie && <span className="tm-mini">zadanie</span>}
                      {doPoprawy.has(e.klucz) && <span className="tm-mini tm-mini-poprawa">do poprawy</span>}
                      {st.rodzaj === 'luki' && <span className="tm-mini tm-mini-luka">{opisLuk(st.luk)}</span>}
                    </span>
                  </button>
                )
              })}
              <span className="tm-lista-kreska" />
              <button className="tm-lista-poz tm-lista-calosc" onClick={() => setStrona('calosc')}>
                <span className="tm-kwadrat">∑</span>
                Całość sektora
              </button>
            </nav>

            <Zrodlo
              key={biezacy.klucz}
              e={biezacy}
              typMini={typMini(biezacy.typ)}
              wersje={dane?.vs ?? []}
              strony={dane?.sp ?? []}
              kafelek={kafelek}
              zakryte={zakryte}
              onZakryte={zmienZakryte}
            />

            <section className="tm-mapa-kolumna">
              <PasekMapy editor={edytor} />
              <KartkaMapy
                klucz={`${j.id}:${biezacy.klucz}`}
                etykieta="Mapa kafelka"
                tytul={biezacy.nazwa}
                typ={typMini(biezacy.typ)}
                wartosc={j.mapyKafelkow?.[biezacy.klucz] ?? ''}
                onZmiana={(md) => void zapiszMapeKafelka(j.id, biezacy.klucz, md)}
                onEdytor={setEdytor}
                placeholder="Mapa tego kafelka własnymi słowami: sens, struktura, przykład i kontrprzykład. „??” oznacza lukę."
              />
              <div className="tm-nawigacja">
                <button className="tm-btn" disabled={nr === 0} onClick={() => setNr((x) => Math.max(0, x - 1))}>
                  ← {nr > 0 ? lista[nr - 1].nazwa : 'Poprzedni'}
                </button>
                {nr < lista.length - 1 ? (
                  <button className="tm-btn tm-btn-glowny" onClick={() => setNr((x) => x + 1)}>
                    Dalej: {lista[nr + 1].nazwa} →
                  </button>
                ) : (
                  <button className="tm-btn tm-btn-glowny" onClick={() => setStrona('calosc')}>
                    Dalej: całość sektora →
                  </button>
                )}
              </div>
            </section>
          </>
        )}

        {strona === 'calosc' && (
          <>
            <aside className="tm-mapy-kafelkow" aria-label="Mapy kafelków">
              <span className="tm-etykieta">Mapy kafelków</span>
              {lista.map((e, i) => {
                const md = j.mapyKafelkow?.[e.klucz]
                const st = stanMapy(md)
                return (
                  <button
                    key={e.klucz}
                    className="tm-mk"
                    title="Otwórz mapę tego kafelka"
                    onClick={() => {
                      setNr(i)
                      setStrona('kafelki')
                    }}
                  >
                    <span className="tm-mk-glowa">
                      {typMini(e.typ)}
                      <b>{e.nazwa}</b>
                      <span className={`tm-mk-stan ${st.rodzaj}`}>
                        {st.rodzaj === 'gotowa' ? '✓' : st.rodzaj === 'luki' ? `?? ${st.luk}` : 'pusta'}
                      </span>
                    </span>
                    {md?.trim() ? (
                      <span className="tm-mk-tresc markdown-body" dangerouslySetInnerHTML={{ __html: html(md) }} />
                    ) : (
                      <span className="tm-mk-pusta">Jeszcze nie zmapowany — otwórz</span>
                    )}
                  </button>
                )
              })}
              {!lista.length && <p className="hint">Sektor nie ma jeszcze kafelków.</p>}
            </aside>
            <section className="tm-mapa-kolumna tm-mapa-szeroka">
              {j.luki && (
                <details className="tm-uwaga" open>
                  <summary>Luki z czatu — popraw mapowanie tych miejsc</summary>
                  <pre>{j.luki}</pre>
                </details>
              )}
              <PasekMapy editor={edytor} />
              <KartkaMapy
                klucz={`${j.id}:sektor`}
                etykieta="Mapa sektora"
                tytul={j.nazwa}
                wartosc={j.mapa ?? ''}
                onZmiana={(md) => void zmienJednostke(j.id, { mapa: md })}
                onEdytor={setEdytor}
                placeholder="Mapa całego sektora — najprostsza forma: po co ten sektor, jak kafelki się łączą, gdzie leży w całości. Zdjęcie mapy z kartki też się nada."
              />
              <div className="tm-nawigacja">
                {lista.length > 0 ? (
                  <button className="tm-btn" onClick={() => setStrona('kafelki')}>
                    ← Kafelki
                  </button>
                ) : (
                  <span />
                )}
                <button className="tm-btn tm-btn-glowny" onClick={() => setStrona('przeglad')}>
                  Dalej: przegląd →
                </button>
              </div>
            </section>
          </>
        )}

        {strona === 'przeglad' && (
          <main className="tm-przeglad">
            <div className="tm-tabela" role="table" aria-label="Mapy kafelków">
              <div className="tm-tabela-w tm-tabela-glowa" role="row">
                <span role="columnheader">Kafelek</span>
                <span role="columnheader" className="tm-tabela-glowa-mapa">
                  Mapa kafelka
                  {lista.length > 0 && (
                    <button className="tm-link" onClick={() => ustawZwiniete(kluczeKafelkow, !wszystkieZwiniete)}>
                      {wszystkieZwiniete ? 'Rozwiń wszystkie' : 'Zwiń wszystkie'}
                    </button>
                  )}
                </span>
                <span role="columnheader">Stan</span>
              </div>
              {lista.map((e, i) => {
                const md = j.mapyKafelkow?.[e.klucz]
                const st = stanMapy(md)
                const zwinieta = zw.has(kluczZw(e.klucz))
                return (
                  <div key={e.klucz} className="tm-tabela-w" role="row">
                    <span role="cell" className="tm-tabela-nazwa">
                      {typMini(e.typ)}
                      <b>{e.nazwa}</b>
                    </span>
                    <span role="cell" className={`tm-tabela-mapa ${zwinieta ? 'zwinieta' : ''}`}>
                      {md?.trim() ? (
                        <>
                          <button
                            className="tm-zwin"
                            aria-expanded={!zwinieta}
                            title={zwinieta ? 'Rozwiń mapę' : 'Zwiń mapę'}
                            onClick={() => ustawZwiniete([kluczZw(e.klucz)], !zwinieta)}
                          >
                            {zwinieta ? '▸' : '▾'}
                          </button>
                          {zwinieta ? (
                            <span className="tm-skrot" onClick={() => ustawZwiniete([kluczZw(e.klucz)], false)}>
                              {skrot(md)}
                            </span>
                          ) : (
                            <span className="markdown-body" dangerouslySetInnerHTML={{ __html: html(md) }} />
                          )}
                        </>
                      ) : (
                        <span className="tm-szary">pusta</span>
                      )}
                    </span>
                    <span role="cell">
                      {st.rodzaj === 'gotowa' ? (
                        <span className="tm-gotowa">✓ gotowa</span>
                      ) : st.rodzaj === 'luki' ? (
                        <button
                          className="tm-luka-btn"
                          onClick={() => {
                            setNr(i)
                            setStrona('kafelki')
                          }}
                        >
                          {opisLuk(st.luk)}
                        </button>
                      ) : (
                        <button
                          className="tm-link"
                          onClick={() => {
                            setNr(i)
                            setStrona('kafelki')
                          }}
                        >
                          Uzupełnij
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
              {!lista.length && <p className="hint tm-tabela-pusto">Sektor nie ma jeszcze kafelków.</p>}
            </div>
            <div className="tm-przeglad-dol">
              <section className="tm-mapa-sektora-podglad" aria-label="Mapa sektora">
                <span className="tm-zakladka-mapy">MAPA SEKTORA</span>
                <h2>
                  {j.mapa?.trim() && (
                    <button
                      className="tm-zwin"
                      aria-expanded={!zw.has(kluczZw('sektor'))}
                      title={zw.has(kluczZw('sektor')) ? 'Rozwiń mapę' : 'Zwiń mapę'}
                      onClick={() => ustawZwiniete([kluczZw('sektor')], !zw.has(kluczZw('sektor')))}
                    >
                      {zw.has(kluczZw('sektor')) ? '▸' : '▾'}
                    </button>
                  )}
                  {j.nazwa}
                </h2>
                {j.mapa?.trim() ? (
                  zw.has(kluczZw('sektor')) ? (
                    <p className="tm-skrot" onClick={() => ustawZwiniete([kluczZw('sektor')], false)}>
                      {skrot(j.mapa)}
                    </p>
                  ) : (
                    <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html(j.mapa) }} />
                  )
                ) : (
                  <p className="tm-szary">Jeszcze pusta.</p>
                )}
                <button className="tm-link tm-otworz-mape" onClick={() => setStrona('calosc')}>
                  Otwórz całą mapę →
                </button>
              </section>
              <CzyPotrafie mapuje={mapuje} onKoniec={skoncz} />
            </div>
          </main>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** „Czy potrafię…" — cel nauki do odhaczenia przed końcem mapowania.
 *  Odhaczenia są tylko na ten moment, niczego nie zapisują. */
function CzyPotrafie({ mapuje, onKoniec }: { mapuje: boolean; onKoniec: () => void }) {
  const [zaz, setZaz] = useState<Set<string>>(new Set())
  return (
    <section className="tm-czy" aria-label="Sprawdź się">
      <span className="tm-etykieta">Czy potrafię…</span>
      {pytania().map((p) => (
        <label key={p} className="tm-czy-punkt">
          <input
            type="checkbox"
            checked={zaz.has(p)}
            onChange={() =>
              setZaz((s) => {
                const n = new Set(s)
                if (n.has(p)) n.delete(p)
                else n.add(p)
                return n
              })
            }
          />
          {p}
        </label>
      ))}
      {mapuje && (
        <button className="tm-btn tm-btn-glowny tm-czy-koniec" onClick={onKoniec}>
          Skończyłem mapowanie → przerwa
        </button>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Źródło: kafelek do czytania, z możliwością zakrycia

function Zrodlo({
  e,
  typMini,
  wersje,
  strony,
  kafelek,
  zakryte,
  onZakryte,
}: {
  e: Element
  typMini: React.ReactNode
  wersje: BlockVersion[]
  strony: Subpage[]
  kafelek: Map<string, Concept>
  /** Zakrycie jest wspólne dla wszystkich kafelków — włącza się raz. */
  zakryte: boolean
  onZakryte: (z: boolean) => void
}) {
  const [strona, setStrona] = useState<string | null>(e.subpageId ?? null)
  const c = e.conceptId ? kafelek.get(e.conceptId) : undefined
  const v = c ? (wersje.find((x) => x.id === e.versionId && x.conceptId === c.id) ?? wersje.find((x) => x.id === c.currentVersionId)) : undefined
  const mojeStrony = v ? strony.filter((s) => s.conceptId === c?.id && s.versionId === v.id).sort((a, b) => a.order - b.order) : []
  const sp = mojeStrony.find((s) => s.id === strona)
  const tresc = sp
    ? (e.wlasne?.[kluczWlasnej(v!.id, sp.id)] ?? sp.content)
    : v
      ? (e.wlasne?.[kluczWlasnej(v.id, null)] ?? v.content)
      : (e.tresc ?? '')
  return (
    <section className="tm-zrodlo" aria-label="Źródło">
      <div className="tm-zrodlo-glowa">
        <span className="tm-etykieta">Źródło</span>
        <button
          className={`tm-przelacznik ${zakryte ? 'wl' : ''}`}
          role="switch"
          aria-checked={zakryte}
          title="Zostaje włączone na kolejnych kafelkach, dopóki nie wyłączysz"
          onClick={() => onZakryte(!zakryte)}
        >
          <span className="tm-przelacznik-tor">
            <span className="tm-przelacznik-galka" />
          </span>
          Zakryte — piszę z pamięci
        </button>
      </div>
      {mojeStrony.length > 0 && (
        <div className="tm-zrodlo-strony">
          <button className={`tm-btn tm-btn-maly ${strona === null ? 'wl' : ''}`} onClick={() => setStrona(null)}>
            {c ? mainPageName(c) : 'Treść'}
          </button>
          {mojeStrony.map((s) => (
            <button key={s.id} className={`tm-btn tm-btn-maly ${strona === s.id ? 'wl' : ''}`} onClick={() => setStrona(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      {zakryte ? (
        <div className="tm-zrodlo-zakryte">
          <Icon name="zakryj" size={1.6} />
          <p>Źródło zakryte — napisz mapę z pamięci, potem odsłoń i popraw.</p>
          <button className="tm-btn" onClick={() => onZakryte(false)}>
            Odsłoń
          </button>
        </div>
      ) : (
        <article className="tm-zrodlo-karta">
          <div className="tm-zrodlo-tytul">
            {typMini}
            <h2>{e.nazwa}</h2>
            <span className="tm-szary">tylko do czytania</span>
          </div>
          <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html(tresc) }} />
        </article>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Szuflady: podgląd ścieżki i biblioteki (tylko czytanie)

function trescWezla(c: Concept | undefined, wersja: Map<string, BlockVersion>, versionId: string | null, wlasne?: Record<string, string>) {
  if (!c) return ''
  const v = wersja.get(versionId ?? '') ?? wersja.get(c.currentVersionId)
  if (!v) return ''
  return wlasne?.[kluczWlasnej(v.id, null)] ?? v.content
}

function PodgladSciezki({
  startPathId,
  mapowane,
  onDoMapy,
  onZamknij,
}: {
  startPathId?: string
  mapowane: Set<string>
  onDoMapy?: (nazwa: string) => void
  onZamknij: () => void
}) {
  const typy = useBlockTypes()
  const sciezki = useLiveQuery(() => db.paths.toArray(), []) ?? []
  const [pathId, setPathId] = useState(startPathId ?? '')
  const [widok, setWidok] = useState<'linia' | 'nauka'>('linia')
  const sciezka = sciezki.find((p) => p.id === pathId) ?? sciezki[0]
  const wezly = useMemo(
    () => (sciezka ? topoOrder(sciezka.nodes, sciezka.edges).filter((n) => n.kind !== 'comment') : []),
    [sciezka],
  )
  const ids = useMemo(() => {
    const s = new Set<string>()
    for (const n of wezly) {
      if (n.kind === 'block') s.add(n.conceptId)
      if (n.kind === 'fusion') for (const p of n.parts) s.add(p.conceptId)
    }
    return [...s].sort()
  }, [wezly])
  const dane = useLiveQuery(async () => {
    const [cs, vs, sp] = await Promise.all([
      db.concepts.where('id').anyOf(ids).toArray(),
      db.versions.where('conceptId').anyOf(ids).toArray(),
      db.subpages.where('conceptId').anyOf(ids).toArray(),
    ])
    return { cs, vs, sp }
  }, [ids.join()])
  /** Wybrana strona kafelka (jak w Linii); bez wyboru — ta z ścieżki. */
  const [wybraneStrony, setWybraneStrony] = useState<Record<string, string | null>>({})
  const sektory = useLiveQuery(
    () => (sciezka ? db.nauka.where('pathId').equals(sciezka.id).toArray() : []),
    [sciezka?.id],
  ) ?? []
  const kafelek = useMemo(() => new Map((dane?.cs ?? []).map((c) => [c.id, c])), [dane])
  const wersja = useMemo(() => new Map((dane?.vs ?? []).map((v) => [v.id, v])), [dane])
  const sektorWezla = useMemo(() => {
    const m = new Map<string, JednostkaNauki>()
    for (const s of sektory) if (s.rodzaj === 'sektor') for (const w of s.wezly) m.set(w, s)
    return m
  }, [sektory])

  const stronyWezla = (n: PathNode) => {
    if (n.kind !== 'block') return { v: undefined, lista: [] as Subpage[] }
    const c = kafelek.get(n.conceptId)
    const v = c ? (wersja.get(n.versionId ?? '') ?? wersja.get(c.currentVersionId)) : undefined
    const lista = v ? (dane?.sp ?? []).filter((s) => s.conceptId === c?.id && s.versionId === v.id).sort((a, b) => a.order - b.order) : []
    return { v, lista }
  }
  const wybranaStrona = (n: PathNode) =>
    n.id in wybraneStrony ? wybraneStrony[n.id] : n.kind === 'block' ? (n.subpageId ?? null) : null
  const tresc = (n: PathNode) => {
    if (n.kind === 'block') {
      const { v, lista } = stronyWezla(n)
      const sp = lista.find((s) => s.id === wybranaStrona(n))
      if (v && sp) return n.wlasneTresci?.[kluczWlasnej(v.id, sp.id)] ?? sp.content
    }
    return n.kind === 'block'
      ? trescWezla(kafelek.get(n.conceptId), wersja, n.versionId, n.wlasneTresci)
      : n.kind === 'fusion'
        ? (n.content ?? n.parts.map((p) => trescWezla(kafelek.get(p.conceptId), wersja, p.versionId, p.wlasneTresci)).join('\n\n'))
        : n.kind === 'text'
          ? n.text
          : ''
  }
  const nazwa = (n: PathNode) =>
    n.kind === 'block' ? (n.nazwa ?? kafelek.get(n.conceptId)?.name ?? 'kafelek') : n.kind === 'fusion' ? n.name || 'grupa' : ''

  let poprzedni: string | undefined
  return (
    <div className="tm-pp">
      <div className="tm-pp-glowa">
        <div className="tm-pp-wiersz">
          <b>Podgląd ścieżki</b>
          <span className="tm-szary">tylko czytanie</span>
          <button className="tm-ikona tm-ikona-mala" onClick={onZamknij} aria-label="Zamknij podgląd">
            ✕
          </button>
        </div>
        <div className="tm-pp-wiersz">
          <span className="tm-zakladki tm-zakladki-male">
            <button className={`tm-zakladka ${widok === 'linia' ? 'wl' : ''}`} onClick={() => setWidok('linia')}>
              Linia
            </button>
            <button className={`tm-zakladka ${widok === 'nauka' ? 'wl' : ''}`} onClick={() => setWidok('nauka')}>
              Nauka
            </button>
          </span>
          <select className="tm-pp-wybor" aria-label="Ścieżka" value={sciezka?.id ?? ''} onChange={(e) => setPathId(e.target.value)}>
            {sciezki
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className={`tm-pp-tresc ${widok === 'nauka' ? 'tm-pp-nauka' : ''}`}>
        {wezly.map((n) => {
          if (n.kind === 'heading')
            return (
              <h3 key={n.id} className={`tm-pp-rozdzial poziom-${n.level ?? 1}`}>
                {n.text || 'rozdział'}
              </h3>
            )
          if (n.kind === 'text') {
            if (widok === 'nauka' || !n.text.trim()) return null
            return <div key={n.id} className="tm-pp-notatka markdown-body" dangerouslySetInnerHTML={{ __html: html(n.text) }} />
          }
          const s = sektorWezla.get(n.id)
          const naglowek = widok === 'nauka' && s && s.id !== poprzedni
          poprzedni = s?.id
          const c = n.kind === 'block' ? kafelek.get(n.conceptId) : undefined
          const typ = n.kind === 'block' ? c?.type : n.kind === 'fusion' ? n.type : undefined
          const def = typ ? typy.def(typ) : undefined
          const tu = mapowane.has(n.id) && sciezka?.id === startPathId
          return (
            <div key={n.id} className="tm-pp-blok">
              {naglowek && (
                <div className="tm-pp-sektor" style={{ '--sektor': s.kolor ?? '#7a869a' } as React.CSSProperties}>
                  {s.nazwa}
                </div>
              )}
              <div
                className={`tm-pp-karta ${tu ? 'tu' : ''}`}
                style={widok === 'nauka' && s ? ({ '--sektor': s.kolor ?? '#7a869a' } as React.CSSProperties) : undefined}
                data-w-sektorze={widok === 'nauka' && s ? '1' : undefined}
              >
                <div className="tm-pp-karta-glowa">
                  {def && (
                    <span className="type-mini" data-typ={def.id} style={typy.style(def.id)}>
                      {def.short}
                    </span>
                  )}
                  <b>{nazwa(n)}</b>
                  {tu ? (
                    <span className="tm-tu">tu mapujesz</span>
                  ) : (
                    onDoMapy && (
                      <button className="tm-tb tm-do-mapy" title="Wstaw do mapy odnośnik do tego kafelka" onClick={() => onDoMapy(nazwa(n))}>
                        ↗ do mapy
                      </button>
                    )
                  )}
                </div>
                {(() => {
                  const { lista } = stronyWezla(n)
                  if (!lista.length || !c) return null
                  const akt = wybranaStrona(n)
                  return (
                    <div className="page-chips tm-pp-strony">
                      {[{ id: null as string | null, name: mainPageName(c) }, ...lista].map((s) => (
                        <button
                          key={s.id ?? 'glowna'}
                          className={`page-chip ${(akt ?? null) === s.id || (s.id === null && !lista.some((x) => x.id === akt)) ? 'active' : ''}`}
                          onClick={() => setWybraneStrony((w) => ({ ...w, [n.id]: s.id }))}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )
                })()}
                <div className="tm-pp-karta-tresc markdown-body" dangerouslySetInnerHTML={{ __html: html(tresc(n)) }} />
              </div>
            </div>
          )
        })}
        {!wezly.length && <p className="hint">Ta ścieżka jest pusta.</p>}
      </div>
    </div>
  )
}

function PodgladBiblioteki({ onDoMapy, onZamknij }: { onDoMapy?: (nazwa: string) => void; onZamknij: () => void }) {
  const typy = useBlockTypes()
  const [szukaj, setSzukaj] = useState('')
  const [otwarty, setOtwarty] = useState<string | null>(null)
  const kafelki = useLiveQuery(() => db.concepts.toArray(), []) ?? []
  const q = szukaj.trim().toLocaleLowerCase('pl')
  // treść przeszukujemy dopiero od trzech liter — wersji bywa dużo
  const wersje = useLiveQuery(() => (q.length >= 3 ? db.versions.toArray() : []), [q.length >= 3]) ?? []
  const wersja = useMemo(() => new Map(wersje.map((v) => [v.id, v])), [wersje])
  const pasujace = useMemo(() => {
    const lista = kafelki.filter((c) => {
      if (!q) return true
      if (c.name.toLocaleLowerCase('pl').includes(q)) return true
      return q.length >= 3 && !!wersja.get(c.currentVersionId)?.content.toLocaleLowerCase('pl').includes(q)
    })
    return lista.sort((a, b) => a.name.localeCompare(b.name, 'pl')).slice(0, 60)
  }, [kafelki, q, wersja])
  const tresc = useLiveQuery(
    async () => (otwarty ? (await db.versions.get((await db.concepts.get(otwarty))?.currentVersionId ?? ''))?.content : undefined),
    [otwarty],
  )
  return (
    <div className="tm-pp">
      <div className="tm-pp-glowa">
        <div className="tm-pp-wiersz">
          <b>Biblioteka</b>
          <span className="tm-szary">tylko czytanie</span>
          <button className="tm-ikona tm-ikona-mala" onClick={onZamknij} aria-label="Zamknij bibliotekę">
            ✕
          </button>
        </div>
        <label className="tm-szukaj">
          <Icon name="szukaj" size={1} />
          <input
            aria-label="Szukaj kafelków"
            placeholder="Szukaj po nazwie, od 3 liter także w treści…"
            value={szukaj}
            onChange={(e) => setSzukaj(e.target.value)}
          />
        </label>
      </div>
      <div className="tm-pp-tresc">
        {pasujace.map((c) => {
          const def = typy.def(c.type)
          return (
            <div key={c.id} className="tm-pp-karta">
              <div className="tm-pp-karta-glowa">
                <span className="type-mini" data-typ={def.id} style={typy.style(def.id)}>
                  {def.short}
                </span>
                <button className="tm-pp-nazwa" aria-expanded={otwarty === c.id} onClick={() => setOtwarty((o) => (o === c.id ? null : c.id))}>
                  {c.name}
                </button>
                {onDoMapy && (
                  <button className="tm-tb tm-do-mapy" title="Wstaw do mapy odnośnik do tego kafelka" onClick={() => onDoMapy(c.name)}>
                    ↗ do mapy
                  </button>
                )}
              </div>
              {otwarty === c.id && tresc !== undefined && (
                <div className="tm-pp-karta-tresc tm-pp-pelna markdown-body" dangerouslySetInnerHTML={{ __html: html(tresc ?? '') }} />
              )}
            </div>
          )
        })}
        {!pasujace.length && <p className="hint">Nic nie pasuje.</p>}
      </div>
    </div>
  )
}
