import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Editor } from '@tiptap/react'
import { adresCzatu, czatWybrany, CZATY, czytajZadania, kopiujPolecenie, otworzCzat, zlozPolecenie, type ZadanieOdCzatu } from '../czat'
import {
  dodajRozwiazanie,
  nazwaRozwiazania,
  przypnijZadanie,
  usunRozwiazanie,
  usunZadanie,
  utworzZadania,
  wczytajZadania,
  zapiszRozwiazanie,
  zapiszZadanie,
  zapiszZrodlaZadania,
  znajdzTypZadania,
  dolozDoSektora,
  odepnijZadanie,
  wezlySektora,
  wstawZadanieNaListe,
  wyjmijZSektora,
  type ZadanieDoEdycji,
} from '../nauka'
import { db, deleteConcept, updateVersion } from '../db'
import { topoOrder } from '../topo'
import { przesunWezel, wstawKafelek, wyjmijWezel } from '../sciezkaLancuch'
import { ustawWidocznosc } from '../widocznosc'
import { useBlockTypes } from '../blockTypes'
import { renderMarkdown } from '../markdown'
import { isPdfSource, type Concept, type JednostkaNauki, type PathNode, type PdfSourceRef, type SourceRef } from '../types'
import { BlockEditor } from './BlockEditor'
import { ConceptPicker } from './ConceptPicker'
import { useDialogs } from './Dialogs'
import { Icon } from './Icon'
import { PdfPanel, type PdfTarget } from './PdfPanel'
import { RichEditor, RichToolbar } from './RichEditor'
import { SourceList } from './SourceList'
import { OkoTestu } from './BlockShell'
import { Etapy } from './TestCzatem'

const nazwaCzatu = () => CZATY.find((c) => c.id === czatWybrany())?.nazwa ?? new URL(adresCzatu()).host

const czytajUstawienie = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const zapiszUstawienie = (k: string, w: string) => {
  try {
    localStorage.setItem(k, w)
  } catch {
    /* bez pamięci — trudno */
  }
}

/** Zapis z opóźnieniem: pisze się płynnie, a do bazy idzie po chwili bez
 *  pisania (i na pewno przy zmianie zadania albo strony). */
function useZapisPoChwili(zapisz: (klucz: string, w: string) => void) {
  const czekajace = useRef(new Map<string, string>())
  const czas = useRef<number | undefined>(undefined)
  const zapiszRef = useRef(zapisz)
  zapiszRef.current = zapisz
  const zywy = useRef(true)
  const wypchnij = () => {
    window.clearTimeout(czas.current)
    for (const [k, w] of czekajace.current) zapiszRef.current(k, w)
    czekajace.current.clear()
  }
  useEffect(() => {
    zywy.current = true
    return () => {
      wypchnij()
      zywy.current = false
    }
  }, [])
  return {
    pisz: (klucz: string, w: string) => {
      // edytor potrafi zgłosić „zmianę" jeszcze przy zamykaniu — wtedy już nic nie zapisujemy
      if (!zywy.current) return
      czekajace.current.set(klucz, w)
      window.clearTimeout(czas.current)
      czas.current = window.setTimeout(wypchnij, 500)
    },
    wypchnij,
  }
}

/** Kafelek-zadanie w kolumnie — wygląda i pisze się jak kafelek w Linii:
 *  nagłówek z rodzajem, nazwą i stronami (Polecenie, Rozwiązanie, …),
 *  treść do pisania od razu, a w stopce źródła (PDF, inne kafelki). */
function KafelekZadania({
  z,
  nr,
  wl,
  nowe,
  doPoprawy,
  typ,
  podpinam,
  onWybierz,
  onNazwa,
  onTresc,
  onRozwiazanie,
  onDodajRozwiazanie,
  onUsunRozwiazanie,
  onUsun,
  onZrodloPdf,
  onZrodloKafelek,
  onSkok,
  onOdepnij,
  onEdytor,
  onMenu,
  onOko,
}: {
  z: ZadanieDoEdycji
  nr: number
  wl: boolean
  nowe: boolean
  doPoprawy: boolean
  typ: string
  podpinam: boolean
  onWybierz: () => void
  onNazwa: (t: string) => void
  onTresc: (t: string) => void
  onRozwiazanie: (stronaId: string, t: string) => void
  onDodajRozwiazanie: () => Promise<string | undefined>
  onUsunRozwiazanie: (stronaId: string) => void
  onUsun: () => void
  onZrodloPdf: () => void
  onZrodloKafelek: () => void
  onSkok: (r: SourceRef) => void
  onOdepnij: (r: SourceRef) => void
  /** Oddaje edytor do wspólnego paska narzędzi u góry kolumny. */
  onEdytor: (ed: Editor | null) => void
  /** Prawy przycisk: menu kafelka (pełna edycja jak w bibliotece, źródła, usuwanie). */
  onMenu: (x: number, y: number) => void
  /** Oko przy stronie: czy widać ją w teście zakrytym (null = polecenie). */
  onOko: (stronaId: string | null, widoczna: boolean) => void
}) {
  const typy = useBlockTypes()
  const [strona, setStrona] = useState<string>('polecenie')
  const [nazwa, setNazwa] = useState(z.nazwa)
  const r = z.rozwiazania.find((x) => x.id === strona)
  const naPoleceniu = strona === 'polecenie' || !r
  /** Treść wczytana do pola — z nią porównujemy „zmiany" zgłaszane przy otwarciu. */
  const wczytana = naPoleceniu ? z.tresc : r!.tresc
  const kluczPola = `${z.id}-${naPoleceniu ? 'polecenie' : r!.id}`
  const wczytanaRef = useRef({ klucz: kluczPola, tresc: wczytana })
  if (wczytanaRef.current.klucz !== kluczPola) wczytanaRef.current = { klucz: kluczPola, tresc: wczytana }

  return (
    <div
      className={`linear-seg ez3-seg ${wl ? 'zaznaczony' : ''}`}
      data-seg={z.id}
      onPointerDownCapture={onWybierz}
      onFocusCapture={onWybierz}
      onContextMenu={(e) => {
        // w polu nazwy zostaje zwykłe menu (kopiuj, wklej, pisownia)
        if ((e.target as Element).closest('input, textarea')) return
        e.preventDefault()
        onMenu(e.clientX, e.clientY)
      }}
    >
      <div className="linear-content">
        <section
          className={`script-block ez2-kafelek ${wl ? 'wl' : ''} ${doPoprawy ? 'do-poprawy' : ''}`}
          data-zadanie-edycja={z.id}
          data-typ={typ}
          style={typy.style(typ)}
        >
          <div className="script-block-glowa">
            <header className="script-block-head">
              <h3 className="script-block-title">
                <span className="script-block-type type-mini" title={typy.label(typ)}>
                  {typy.short(typ)}
                </span>{' '}
                <input
                  className="inline-title ez2-tytul ez-nazwa-pole"
                  value={nazwa}
                  autoFocus={nowe}
                  placeholder={`Zadanie ${nr}`}
                  aria-label="Nazwa zadania"
                  onChange={(e) => {
                    setNazwa(e.target.value)
                    onNazwa(e.target.value)
                  }}
                />
              </h3>
              <div className="block-pages ez2-strony" role="tablist">
                <button
                  role="tab"
                  aria-selected={naPoleceniu}
                  className={`block-page ${naPoleceniu ? 'active' : ''}`}
                  title="Polecenie — widać je w teście"
                  onClick={() => setStrona('polecenie')}
                  data-strona="polecenie"
                >
                  Polecenie
                </button>
                <OkoTestu widoczna={z.glownaWTescie ?? true} onZmien={(w) => onOko(null, w)} />
                {z.rozwiazania.map((x) => (
                  <span key={x.id} className={`ez3-strona ${strona === x.id ? 'active' : ''}`}>
                    <button
                      role="tab"
                      aria-selected={strona === x.id}
                      className={`block-page ${strona === x.id ? 'active' : ''}`}
                      title="Rozwiązanie — w teście zakryte"
                      onClick={() => setStrona(x.id)}
                      data-strona="rozwiazanie"
                    >
                      {x.nazwa}
                    </button>
                    <OkoTestu widoczna={!!x.wTescie} onZmien={(w) => onOko(x.id, w)} />
                    {strona === x.id && (
                      <button
                        className="ez2-strona-usun"
                        title={`Usuń stronę „${x.nazwa}" (zapyta)`}
                        aria-label={`Usuń stronę ${x.nazwa}`}
                        onClick={() => onUsunRozwiazanie(x.id)}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                <button
                  className="block-page ez3-plus"
                  data-dodaj-rozwiazanie
                  title="Kolejne rozwiązanie — np. inną metodą"
                  onClick={async () => {
                    const id = await onDodajRozwiazanie()
                    if (id) setStrona(id)
                  }}
                >
                  + rozwiązanie
                </button>
              </div>
              {doPoprawy && <span className="tcz-r tcz-r-nie">do poprawy</span>}
            </header>

            <div className="script-block-body">
              <div className="block-content ez2-edytor">
                <RichEditor
                  key={kluczPola}
                  value={wczytana}
                  editable
                  bezPaska
                  ruler={false}
                  onReady={onEdytor}
                  placeholder={
                    naPoleceniu
                      ? 'Polecenie — widać je w teście. Tak, żeby dało się zacząć bez zaglądania gdzie indziej.'
                      : 'Rozwiązanie — w teście zakryte. Metoda: pomysł i kluczowe kroki, dlaczego to działa.'
                  }
                  onChange={(md) => {
                    // bez prawdziwej zmiany (edytor normalizuje treść przy otwarciu) — nic nie zapisujemy
                    if (md === wczytanaRef.current.tresc) return
                    wczytanaRef.current = { klucz: kluczPola, tresc: md }
                    if (naPoleceniu) onTresc(md)
                    else onRozwiazanie(r!.id, md)
                  }}
                />
              </div>
            </div>
          </div>
          <div className="block-stopka ez3-stopka">
            <SourceList refs={z.zrodla} onJump={onSkok} onRemove={onOdepnij} />
            <div className="ez3-zrodla-dodaj">
              <button
                className={`btn btn-dolacz ${podpinam ? 'btn-active' : ''}`}
                data-zrodlo-pdf
                title="Zaznacz fragment w PDF i podepnij go jako źródło tego zadania"
                onClick={onZrodloPdf}
              >
                <Icon name="book-open" size={0.95} />
                {podpinam ? 'Zaznacz w PDF…' : 'Źródło z PDF'}
              </button>
              <button
                className="btn btn-dolacz"
                data-zrodlo-kafelek
                title="Wskaż kafelek z biblioteki, na którym to zadanie się opiera"
                onClick={onZrodloKafelek}
              >
                <Icon name="library" size={0.95} />
                Kafelek jako źródło
              </button>
              <button className="btn btn-dolacz ez-usun" title="Usuń to zadanie (zapyta)" onClick={onUsun}>
                <Icon name="usun" size={0.95} />
                Usuń
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

/** Zadania od czatu: polecenie (czat najpierw daje same zadania, ty
 *  rozwiązujesz, on poprawia, na końcu blok kodu), wklejenie, podgląd
 *  rozpoznanych kafelków i „Dodaj do zadań". */
function ZadaniaZCzatem({
  znak,
  kolor,
  proba,
  zloz,
  onDodaj,
  onZamknij,
}: {
  znak: string
  kolor: string
  proba: boolean
  zloz: () => Promise<string>
  onDodaj: (l: ZadanieOdCzatu[]) => Promise<void>
  onZamknij: () => void
}) {
  const [tekst, setTekst] = useState<string | null>(null)
  const [wklejone, setWklejone] = useState('')
  const [wybrane, setWybrane] = useState<Set<number>>(new Set())
  const odczytane = useMemo<ZadanieOdCzatu[]>(() => (wklejone.trim() ? czytajZadania(wklejone) : []), [wklejone])
  useEffect(() => setWybrane(new Set(odczytane.map((_, i) => i))), [odczytane])
  const pobierz = async () => {
    const t = await zloz()
    setTekst(t)
    return t
  }
  const skopiowane = tekst !== null
  return (
    <div className="tcz ez2-czat ez3-czat" data-panel-czatu>
      <div className="tcz-glowa tcz-glowa-rzad">
        <div>
          <h2 className="ez2-h2">
            <span className="ez2-czat-znak" aria-hidden>
              ✦
            </span>{' '}
            Zadania z czatem
          </h2>
          <p className="tcz-pod">
            Czat ułoży nowe zadania do tego sektora — inne niż te, które już są — i przerobi je z tobą.
          </p>
        </div>
        <button className="tcz-link" onClick={onZamknij}>
          Zwiń
        </button>
      </div>
      <div className="tcz-kroki">
        <div className={`tcz-karta tcz-krok tcz-krok-czat ${skopiowane ? 'zrobiony' : 'teraz'}`}>
          <div className="tcz-krok-glowa">
            <span className="tcz-nr">{skopiowane ? '✓' : 1}</span>
            <b>Otwórz czat</b>
          </div>
          <button className="btn btn-primary tcz-otworz" onClick={async () => void otworzCzat(await pobierz())}>
            Kopiuj polecenie i otwórz {nazwaCzatu()}
          </button>
          <button className="tcz-link" onClick={async () => void kopiujPolecenie(await pobierz())}>
            Tylko kopiuj
          </button>
          {tekst !== null && (
            <details className="test-czatem-polecenie">
              <summary>Pokaż polecenie</summary>
              <textarea readOnly value={tekst} rows={10} onFocus={(e) => e.target.select()} />
            </details>
          )}
        </div>
        <div className={`tcz-karta tcz-krok ${skopiowane ? 'teraz' : ''}`}>
          <div className="tcz-krok-glowa">
            <span className="tcz-nr">2</span>
            <b>Rozwiązuj z czatem</b>
          </div>
          <p className="tcz-szary">
            Czat najpierw poda <strong>same polecenia</strong> — bez odpowiedzi. Rozwiązujesz, wysyłasz mu
            swoje rozwiązania, a on je poprawia albo uznaje.
          </p>
        </div>
        <div className="tcz-karta tcz-krok">
          <div className="tcz-krok-glowa">
            <span className="tcz-nr">3</span>
            <b>Wklej kod od czatu</b>
          </div>
          <p className="tcz-szary">
            Na końcu czat poda blok kodu z zadaniami (ZADANIE, TREŚĆ, ROZWIĄZANIE). Skopiuj go i wklej
            poniżej.
          </p>
        </div>
      </div>
      <div className="tcz-wklej duze">
        <textarea
          className="tcz-pole-wklej ez-wklej"
          aria-label="Kod z zadaniami od czatu"
          rows={5}
          placeholder={'Wklej tutaj — Ctrl+V\n\nBlok kodu z końca rozmowy: ZADANIE, TREŚĆ, ROZWIĄZANIE.'}
          value={wklejone}
          onChange={(e) => setWklejone(e.target.value)}
        />
        {proba && (
          <div className="test-czatem-przyklady">
            <span className="tcz-szary">Próba — wstaw gotowy kod:</span>
            <button className="btn btn-maly" onClick={() => setWklejone(PRZYKLAD_ZADAN)}>
              Dwa zadania od czatu
            </button>
          </div>
        )}
      </div>
      {wklejone.trim() && !odczytane.length && (
        <p className="tcz-karta tcz-pusto">
          Nie widzę zadań. Czat powinien podać je w bloku kodu według wzoru: ZADANIE, TREŚĆ, ROZWIĄZANIE.
        </p>
      )}
      {odczytane.length > 0 && (
        <section className="ez2-rozpoznane">
          <div>
            <h2 className="ez2-h2">
              Rozpoznane: {odczytane.length} {odczytane.length === 1 ? 'zadanie' : odczytane.length < 5 ? 'zadania' : 'zadań'}
            </h2>
            <p className="tcz-szary">Tak zostaną dodane — jako kafelki-zadania. Odznacz te, których nie chcesz.</p>
          </div>
          <ul className="ez-od-czatu ez2-podglad">
            {odczytane.map((z, i) => (
              <li key={i} className={`ez2-mini ${wybrane.has(i) ? 'wl' : ''}`} style={{ '--typ': kolor } as CSSProperties}>
                <label className="ez2-mini-glowa">
                  <input
                    type="checkbox"
                    checked={wybrane.has(i)}
                    onChange={() =>
                      setWybrane((s) => {
                        const n = new Set(s)
                        if (n.has(i)) n.delete(i)
                        else n.add(i)
                        return n
                      })
                    }
                  />
                  <span className="ez2-typ">{znak}</span>
                  <strong>{z.nazwa}</strong>
                </label>
                <div className="ez2-mini-strona">
                  <span className="tcz-lbl">Polecenie</span>
                  <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(z.tresc || '_(puste)_') }} />
                </div>
                <div className="ez2-mini-rozw">
                  {z.rozwiazania.length ? (
                    z.rozwiazania.map((_, k) => (
                      <span key={k} className="tcz-r tcz-r-tak">
                        ✓ {nazwaRozwiazania(k)}
                      </span>
                    ))
                  ) : (
                    <span className="tcz-r tcz-r-czesciowo">bez rozwiązania — dopiszesz sam</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="tcz-przyciski">
            <button
              className="btn btn-primary"
              disabled={!wybrane.size}
              data-dodaj-od-czatu
              onClick={async () => {
                await onDodaj(odczytane.filter((_, i) => wybrane.has(i)))
                setWklejone('')
              }}
            >
              Dodaj do zadań ({wybrane.size})
            </button>
            <button className="tcz-link" onClick={() => setWklejone('')}>
              Wklej ponownie
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

/** Przewija kolumnę do kafelka-zadania (albo innego elementu). */
const przewin = (sel: string) =>
  window.setTimeout(() => document.querySelector(sel)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60)

/** Ekran zadań sektora — jak Linia: z lewej spis zadań, pośrodku kolumna
 *  kafelków-zadań do pisania wprost i „Dołóż" na końcu (zadanie, z czatem,
 *  z biblioteki), z prawej panel PDF do czytania i podpinania źródeł. Na dole
 *  dalej: test zakryty z zadaniami (albo „Pomiń zadania"). Ekran działa też po
 *  nauce sektora — nowe zadania trafiają wtedy do „Doucz nowe".
 *  `proba` — zadania tylko w pamięci, nic się nie zapisuje. */
export function EtapZadan({
  j,
  proba,
  onTest,
  onGotowe,
}: {
  j: JednostkaNauki
  proba?: boolean
  onTest: () => void
  onGotowe?: () => void
}) {
  const dlg = useDialogs()
  const typy = useBlockTypes()
  const typZad = znajdzTypZadania(typy.all)
  const def = typy.all.find((t) => t.id === typZad)
  const znak = def?.short ?? 'ZAD'
  const kolor = def?.color ?? 'var(--accent)'
  // Spis sektora: jego kafelki w kolejności Linii. Zadaniem jest każdy kafelek
  // rodzaju „Zadanie" — ten stojący w Linii i ten z listy na końcu sektora.
  const sciezka = useLiveQuery(() => (j.pathId ? db.paths.get(j.pathId) : undefined), [j.pathId])
  const ordered = useMemo(() => (sciezka ? topoOrder(sciezka.nodes, sciezka.edges) : []), [sciezka])
  const spis = useMemo(() => wezlySektora(j, sciezka), [sciezka, j])
  const idsSpisu = spis.flatMap((n) => (n.kind === 'block' ? [n.conceptId] : []))
  const kafelkiSpisu = useLiveQuery(() => db.concepts.bulkGet(idsSpisu), [idsSpisu.join()]) ?? []
  const kafelekSpisu = new Map(kafelkiSpisu.flatMap((c) => (c ? [[c.id, c] as const] : [])))
  const wLinii = proba
    ? []
    : spis.flatMap((n) =>
        n.kind === 'block' && kafelekSpisu.get(n.conceptId)?.type === typZad ? [{ nodeId: n.id, conceptId: n.conceptId }] : [],
      )
  /** Zadanie stojące w Linii → jego węzeł. */
  const wezelZadania = new Map(wLinii.map((x) => [x.conceptId, x.nodeId]))
  const idsZadan = [...new Set([...wLinii.map((x) => x.conceptId), ...(j.zadania ?? [])])]
  const zBazy = useLiveQuery(() => (proba ? Promise.resolve([]) : wczytajZadania(idsZadan)), [proba, idsZadan.join()])
  const [lokalne, setLokalne] = useState<ZadanieDoEdycji[]>([])
  const zadania = proba ? lokalne : (zBazy ?? [])
  const [wybrany, setWybrany] = useState<string | null>(null)
  const [nowy, setNowy] = useState<string | null>(null)
  // „nowe" tylko na chwilę po dodaniu — inaczej po powrocie z pełnej edycji
  // nowo narysowany kafelek znów łapałby kursor
  useEffect(() => {
    if (!nowy) return
    const t = window.setTimeout(() => setNowy(null), 600)
    return () => window.clearTimeout(t)
  }, [nowy])
  const [czat, setCzat] = useState(false)
  /** Menu pod prawym przyciskiem przy kafelku-zadaniu. */
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  useEffect(() => {
    if (!menu) return
    const zamknij = () => setMenu(null)
    const klawisz = (e: KeyboardEvent) => e.key === 'Escape' && zamknij()
    window.addEventListener('pointerdown', zamknij)
    window.addEventListener('keydown', klawisz)
    window.addEventListener('resize', zamknij)
    return () => {
      window.removeEventListener('pointerdown', zamknij)
      window.removeEventListener('keydown', klawisz)
      window.removeEventListener('resize', zamknij)
    }
  }, [menu])
  /** Pełna edycja kafelka (ten sam edytor co w bibliotece) zamiast kolumny. */
  const [pelny, setPelny] = useState<string | null>(null)
  const [wersjaPelna, setWersjaPelna] = useState<string | null>(null)
  const pelnyConcept = useLiveQuery(() => (pelny ? db.concepts.get(pelny) : undefined), [pelny])
  const pelneWersje = useLiveQuery(() => (pelny ? db.versions.where('conceptId').equals(pelny).toArray() : []), [pelny]) ?? []
  const pelnaWersja =
    pelneWersje.find((v) => v.id === wersjaPelna) ??
    pelneWersje.find((v) => v.id === pelnyConcept?.currentVersionId) ??
    // bieżąca wersja zgubiona — otwieramy najnowszą, zamiast nie otworzyć nic
    [...pelneWersje].sort((a, b) => b.version - a.version)[0]
  /** Edytory kafelków — jeden wspólny pasek narzędzi działa na wybranym, jak w Linii. */
  const edytory = useRef(new Map<string, Editor>())
  const [, setIleEdytorow] = useState(0)
  const zarejestruj = (id: string, ed: Editor | null) => {
    if (ed) edytory.current.set(id, ed)
    else edytory.current.delete(id)
    setIleEdytorow((n) => n + 1)
  }
  const poprawki = new Set(j.doPoprawy ?? [])

  // PDF z prawej: pamiętany między wejściami; podpinanie źródła do zadania
  const [pdf, setPdf] = useState(() => czytajUstawienie('ui.zadaniaPdf') === '1')
  useEffect(() => zapiszUstawienie('ui.zadaniaPdf', pdf ? '1' : '0'), [pdf])
  const [cel, setCel] = useState<PdfTarget | null>(null)
  const [podpinam, setPodpinam] = useState<string | null>(null)
  /** Wybór kafelka z biblioteki: jako źródło zadania albo jako nowe zadanie. */
  const [wybor, setWybor] = useState<{ rodzaj: 'zrodlo'; id: string } | { rodzaj: 'zadanie' } | null>(null)
  useEffect(() => {
    if (!podpinam) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setPodpinam(null)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [podpinam])

  const zmienLok = (id: string, f: (z: ZadanieDoEdycji) => ZadanieDoEdycji) =>
    setLokalne((l) => l.map((z) => (z.id === id ? f(z) : z)))
  const zapis = useZapisPoChwili((klucz, w) => {
    if (proba) return
    const [rodzaj, id] = [klucz.slice(0, 1), klucz.slice(2)]
    if (rodzaj === 'n') void zapiszZadanie(id, { nazwa: w })
    else if (rodzaj === 't') void zapiszZadanie(id, { tresc: w })
    else void zapiszRozwiazanie(id, w)
  })

  const dodaj = async (lista: { nazwa?: string; tresc?: string; rozwiazania?: string[] }[]): Promise<string[]> => {
    zapis.wypchnij()
    if (proba) {
      const t = Date.now()
      const nowe = lista.map((z, i) => ({
        id: `proba-${t}-${i}`,
        nazwa: z.nazwa ?? `Zadanie ${lokalne.length + i + 1}`,
        tresc: z.tresc ?? '',
        rozwiazania: (z.rozwiazania?.length ? z.rozwiazania : ['']).map((r, k) => ({
          id: `proba-${t}-${i}-r${k}`,
          nazwa: nazwaRozwiazania(k),
          tresc: r,
        })),
        zrodla: [],
      }))
      setLokalne((l) => [...l, ...nowe])
      return nowe.map((z) => z.id)
    }
    return utworzZadania(j.id, lista)
  }

  const pokaz = (id: string) => {
    setWybrany(id)
    przewin(`[data-zadanie-edycja="${id}"]`)
  }

  const komunikat = (t: string) => window.dispatchEvent(new CustomEvent('komp:komunikat', { detail: t }))
  const otworzPelna = async (id: string) => {
    if (proba) {
      komunikat('Próba: te zadania są tylko na niby, w pamięci — pełna edycja działa w prawdziwym sektorze.')
      return
    }
    zapis.wypchnij()
    // nigdy po cichu: jeśli kafelka nie ma, mówimy o tym
    if (!(await db.concepts.get(id))) {
      komunikat('Nie znalazłem tego kafelka w bibliotece — nie da się go otworzyć.')
      return
    }
    setPodpinam(null)
    setWersjaPelna(null)
    setPelny(id)
  }
  const zamknijPelna = () => {
    const id = pelny
    setPelny(null)
    setPodpinam(null)
    if (id) pokaz(id)
  }

  const nowe = async () => {
    const [id] = await dodaj([{}])
    if (id) {
      setNowy(id)
      pokaz(id)
    }
  }

  const usun = async (z: ZadanieDoEdycji) => {
    const ok = await dlg.confirm({
      title: `Usunąć zadanie „${z.nazwa || 'Zadanie'}"?`,
      message: proba ? 'To tylko próba — nic się nie zapisuje.' : 'Kafelek zniknie razem z poleceniem i rozwiązaniami.',
      confirmLabel: 'Usuń zadanie',
      danger: true,
    })
    if (!ok) return
    zapis.wypchnij()
    if (proba) setLokalne((l) => l.filter((x) => x.id !== z.id))
    else {
      const nodeId = wezelZadania.get(z.id)
      if (nodeId && j.pathId) {
        // zadanie z Linii: znika z Linii; kafelek z folderu ścieżki znika
        // całkiem, kafelek z biblioteki zostaje w bibliotece
        await wyjmijWezel(j.pathId, nodeId)
        await wyjmijZSektora(j.id, [nodeId])
        if ((await db.concepts.get(z.id))?.pathId === j.pathId) await deleteConcept(z.id)
      } else await usunZadanie(j.id, z.id)
    }
    if (podpinam === z.id) setPodpinam(null)
  }

  // ---- układanie: przeciąganie zadań w spisie sektora i na listę na końcu ----
  const [ciagnie, setCiagnie] = useState<{ conceptId: string; nodeId?: string } | null>(null)
  const [celUpuszczenia, setCelUpuszczenia] = useState<{ gdzie: 'linia' | 'lista'; i: number } | null>(null)
  const nadPozycja = (e: React.DragEvent, gdzie: 'linia' | 'lista', i: number) => {
    if (!ciagnie) return
    e.preventDefault()
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setCelUpuszczenia({ gdzie, i: e.clientY - r.top < r.height / 2 ? i : i + 1 })
  }
  const upusc = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const c = ciagnie
    const t = celUpuszczenia
    setCiagnie(null)
    setCelUpuszczenia(null)
    if (!c || !t || proba || !j.pathId) return
    zapis.wypchnij()
    if (t.gdzie === 'linia') {
      // miejsce w Linii: za poprzednim kafelkiem spisu albo przed następnym
      const bez = ordered.filter((n) => n.id !== c.nodeId)
      let przed: PathNode | undefined
      for (let k = t.i - 1; k >= 0 && !przed; k--) if (spis[k].id !== c.nodeId) przed = spis[k]
      let po: PathNode | undefined
      for (let k = t.i; k < spis.length && !po; k++) if (spis[k].id !== c.nodeId) po = spis[k]
      let afterId: string | null
      let beforeId: string | null
      if (przed) {
        afterId = przed.id
        beforeId = bez[bez.findIndex((n) => n.id === przed!.id) + 1]?.id ?? null
      } else if (po) {
        beforeId = po.id
        afterId = bez[bez.findIndex((n) => n.id === po!.id) - 1]?.id ?? null
      } else {
        afterId = bez[bez.length - 1]?.id ?? null
        beforeId = null
      }
      if (c.nodeId) {
        await przesunWezel(j.pathId, c.nodeId, afterId, beforeId)
        await dolozDoSektora(j.id, [c.nodeId])
      } else {
        const id = await wstawKafelek(j.pathId, c.conceptId, afterId, beforeId)
        await dolozDoSektora(j.id, [id])
        await odepnijZadanie(j.id, c.conceptId)
      }
      return
    }
    const listaIds = j.zadania ?? []
    const docel = lista[t.i] ? listaIds.indexOf(lista[t.i].id) : listaIds.length
    if (c.nodeId) {
      const n = sciezka?.nodes.find((x) => x.id === c.nodeId)
      const k = kafelekSpisu.get(c.conceptId)
      if (n?.kind === 'block' && k && k.pathId !== j.pathId && (n.nazwa !== undefined || Object.keys(n.wlasneTresci ?? {}).length > 0)) {
        komunikat('To zadanie ma tekst napisany tylko w tej ścieżce — na liście by przepadł. Wyślij go najpierw do biblioteki.')
        return
      }
      await wyjmijWezel(j.pathId, c.nodeId)
      await wyjmijZSektora(j.id, [c.nodeId])
      await wstawZadanieNaListe(j.id, c.conceptId, docel)
    } else {
      const skad = listaIds.indexOf(c.conceptId)
      await wstawZadanieNaListe(j.id, c.conceptId, skad >= 0 && skad < docel ? docel - 1 : docel)
    }
  }

  const usunStrone = async (z: ZadanieDoEdycji, stronaId: string) => {
    const r = z.rozwiazania.find((x) => x.id === stronaId)
    const ok = await dlg.confirm({
      title: `Usunąć stronę „${r?.nazwa ?? 'Rozwiązanie'}"?`,
      message: proba ? 'To tylko próba — nic się nie zapisuje.' : 'Zniknie to rozwiązanie; zadanie i reszta stron zostają.',
      confirmLabel: 'Usuń stronę',
      danger: true,
    })
    if (!ok) return
    zapis.wypchnij()
    if (proba) zmienLok(z.id, (x) => ({ ...x, rozwiazania: x.rozwiazania.filter((y) => y.id !== stronaId) }))
    else await usunRozwiazanie(stronaId)
  }

  /** Źródła zadania: w próbie tylko w pamięci, poza nią w bieżącej wersji kafelka. */
  const ustawZrodla = (id: string, f: (l: SourceRef[]) => SourceRef[]) => {
    const z = zadania.find((x) => x.id === id)
    if (!z) return
    const nowe = f(z.zrodla)
    if (proba) zmienLok(id, (x) => ({ ...x, zrodla: nowe }))
    else void zapiszZrodlaZadania(id, nowe)
  }

  const naFragment = async (base: Omit<PdfSourceRef, 'id'>) => {
    if (!podpinam) return
    // pełna edycja: źródło do wersji, którą właśnie widać
    if (pelny && podpinam === pelny && pelnaWersja) {
      const v = await db.versions.get(pelnaWersja.id)
      if (v) await updateVersion(v.id, { sourceRefs: [...v.sourceRefs, { id: crypto.randomUUID(), ...base }] })
      setPodpinam(null)
      return
    }
    ustawZrodla(podpinam, (l) => [...l, { id: crypto.randomUUID(), ...base }])
    const z = zadania.find((x) => x.id === podpinam)
    window.dispatchEvent(new CustomEvent('komp:komunikat', { detail: `Podpięte źródło do „${z?.nazwa || 'zadania'}"` }))
    setPodpinam(null)
  }

  const naKafelek = async (c: Concept) => {
    const w = wybor
    setWybor(null)
    if (!w) return
    if (w.rodzaj === 'zrodlo') {
      ustawZrodla(w.id, (l) =>
        l.some((r) => !isPdfSource(r) && r.conceptId === c.id)
          ? l
          : [...l, { id: crypto.randomUUID(), kind: 'block' as const, conceptId: c.id, versionId: null }],
      )
      return
    }
    // kafelek z biblioteki jako zadanie sektora
    if (zadania.some((z) => z.id === c.id)) return pokaz(c.id)
    if (proba) {
      const v = await db.versions.get(c.currentVersionId)
      const id = `proba-${Date.now()}`
      setLokalne((l) => [...l, { id, nazwa: c.name, tresc: v?.content ?? '', rozwiazania: [], zrodla: v?.sourceRefs ?? [] }])
      pokaz(id)
      return
    }
    await przypnijZadanie(j.id, c.id)
    pokaz(c.id)
  }

  const skok = (r: SourceRef) => {
    if (!isPdfSource(r)) return
    setPdf(true)
    setCel({ pdfId: r.pdfId, page: r.page, rect: r.rect })
  }

  const zloz = async () => {
    zapis.wypchnij()
    let t = await zlozPolecenie(j, { rodzaj: 'zadania' })
    // w próbie czat ma też widzieć zadania dodane „na niby"
    if (proba && lokalne.length) {
      const dopisane = lokalne.map((z) => `  - ${z.nazwa}${z.tresc ? `: ${z.tresc.replace(/\s+/g, ' ').slice(0, 400)}` : ''}`).join('\n')
      t = t.replace('  (jeszcze nie ma żadnych)', dopisane)
    }
    return t
  }

  /** Zadania z listy na końcu sektora (te, które nie stoją w Linii). */
  const lista = zadania.filter((z) => !wezelZadania.has(z.id))
  const pozycjaZadania = (z: ZadanieDoEdycji, nodeId?: string) => (
    <button
      className={`ez2-poz ${wybrany === z.id ? 'wl' : ''} ${poprawki.has(z.id) ? 'do-poprawy' : ''} ${nodeId ? 'w-linii' : ''} ${ciagnie?.conceptId === z.id ? 'ciagniete' : ''}`}
      data-zadanie={z.id}
      data-w-linii={nodeId ? '' : undefined}
      draggable={!proba}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', z.nazwa || 'Zadanie')
        e.dataTransfer.effectAllowed = 'move'
        setCiagnie({ conceptId: z.id, nodeId })
      }}
      onDragEnd={() => {
        setCiagnie(null)
        setCelUpuszczenia(null)
      }}
      onClick={() => {
        zapis.wypchnij()
        pokaz(z.id)
      }}
      title={proba ? undefined : 'Klik — pokaż; przeciągnij — przestaw'}
    >
      {!proba && (
        <span className="ez3-uchwyt" aria-hidden>
          <Icon name="przesun" size={0.85} />
        </span>
      )}
      <span className="ez2-nr">{zadania.indexOf(z) + 1}</span>
      <span className="ez2-poz-nazwa">{z.nazwa || 'Zadanie'}</span>
      {z.zrodla.length > 0 && (
        <span className="ez3-poz-zrodla" title={`Źródła: ${z.zrodla.length}`}>
          <Icon name="book-open" size={0.8} />
        </span>
      )}
      {poprawki.has(z.id) && <span className="ez2-poz-znak">do poprawy</span>}
    </button>
  )

  const wPowtorceZero = j.etap === 'zadania'
  const zadanieDoPodpiecia =
    zadania.find((z) => z.id === podpinam) ??
    (pelny && podpinam === pelny && pelnyConcept ? { nazwa: pelnyConcept.name } : undefined)
  return (
    <div className={`ez3 ${pdf ? 'z-pdf' : ''}`}>
      {(wPowtorceZero || (!!j.doPoprawy?.length && wPowtorceZero)) && (
        <div className="ez3-gora">
          <div className="tcz ez3-etapy">
            <Etapy teraz={4} />
          </div>
          {!!j.doPoprawy?.length && (
            <p className="tcz-karta ez2-uwaga sesja-uwaga-poprawa">
              Test zakryty nie wyszedł — popraw zaznaczone ({j.doPoprawy.length}) i zrób go jeszcze raz.
            </p>
          )}
        </div>
      )}
      <div className="ez2 etap-zadan ez3-uklad">
        <aside className="ez2-lewa ez3-lewa" aria-label="Spis sektora">
          <span className="tcz-lbl">Spis sektora{j.nazwa ? ` · ${j.nazwa}` : ''}</span>
          {spis.length > 0 ? (
            <ol className="ez3-spis" onDrop={(e) => void upusc(e)} onDragOver={(e) => ciagnie && e.preventDefault()}>
              {spis.map((n, i) => {
                const z = n.kind === 'block' && wezelZadania.get(n.conceptId) === n.id ? zadania.find((x) => x.id === n.conceptId) : undefined
                const kreska =
                  celUpuszczenia?.gdzie === 'linia' && celUpuszczenia.i === i
                    ? 'kreska-przed'
                    : celUpuszczenia?.gdzie === 'linia' && celUpuszczenia.i === i + 1 && i === spis.length - 1
                      ? 'kreska-po'
                      : ''
                return (
                  <li key={n.id} className={kreska} onDragOver={(e) => nadPozycja(e, 'linia', i)}>
                    {z ? (
                      pozycjaZadania(z, n.id)
                    ) : n.kind === 'heading' ? (
                      <span className="ez3-spis-rozdzial">{n.text || 'Rozdział'}</span>
                    ) : n.kind === 'text' ? (
                      <span className="ez3-spis-kafelek ez3-spis-notatka">notatka</span>
                    ) : (
                      <span className="ez3-spis-kafelek">
                        <span className="ez3-spis-typ">
                          {n.kind === 'block' ? typy.short(kafelekSpisu.get(n.conceptId)?.type ?? '') : n.kind === 'fusion' ? typy.short(n.type ?? '') : ''}
                        </span>
                        <span className="ez3-spis-nazwa">
                          {n.kind === 'block'
                            ? (n.nazwa ?? kafelekSpisu.get(n.conceptId)?.name ?? '…')
                            : n.kind === 'fusion'
                              ? n.name || 'Grupa'
                              : ''}
                        </span>
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="tcz-szary ez2-brak">Sektor nie ma jeszcze kafelków w Linii.</p>
          )}
          <span className="tcz-lbl ez3-spis-koniec">Na końcu sektora{lista.length ? ` · ${lista.length}` : ''}</span>
          <ol
            className={`ez2-lista ez3-lista-konca ${celUpuszczenia?.gdzie === 'lista' ? 'cel' : ''}`}
            onDragOver={(e) => {
              if (!ciagnie) return
              e.preventDefault()
              if (!(e.target as Element).closest('li[data-poz]')) setCelUpuszczenia({ gdzie: 'lista', i: lista.length })
            }}
            onDrop={(e) => void upusc(e)}
          >
            {lista.map((z, k) => (
              <li
                key={z.id}
                className={
                  celUpuszczenia?.gdzie === 'lista' && celUpuszczenia.i === k
                    ? 'kreska-przed'
                    : celUpuszczenia?.gdzie === 'lista' && celUpuszczenia.i === k + 1 && k === lista.length - 1
                      ? 'kreska-po'
                      : ''
                }
                data-poz
                onDragOver={(e) => nadPozycja(e, 'lista', k)}
              >
                {pozycjaZadania(z)}
              </li>
            ))}
            {!lista.length && <li className="ez3-lista-pusta">{ciagnie ? 'Upuść tutaj' : 'Nowe zadania lądują tutaj'}</li>}
          </ol>
          <p className="tcz-szary ez3-spis-rada">
            {proba
              ? 'W próbie układanie jest wyłączone — zadania są tylko na niby.'
              : 'Przeciągnij zadanie (⠿) w spisie tam, gdzie ma stać w Linii, albo na listę na końcu sektora.'}
          </p>
          <button
            className={`btn btn-dolacz ez3-pdf-przelacz ${pdf ? 'btn-active' : ''}`}
            data-pdf
            title={pdf ? 'Schowaj panel PDF' : 'Pokaż panel PDF — do czytania i podpinania źródeł'}
            onClick={() => {
              setPdf((p) => !p)
              setPodpinam(null)
            }}
          >
            <Icon name="book-open" size={0.95} />
            {pdf ? 'Schowaj PDF' : 'PDF obok'}
          </button>
        </aside>

        {pelny && pelnyConcept && pelnaWersja ? (
          <section className="ez3-pelna" data-pelna-edycja-widok>
            <div className="ez3-pelna-pasek">
              <button className="btn" onClick={zamknijPelna} data-wroc-do-zadan>
                ← Wróć do zadań
              </button>
              <span className="tcz-szary">Pełna edycja — jak w bibliotece. Zmiany zapisują się od razu.</span>
            </div>
            <BlockEditor
              key={pelnyConcept.id}
              concept={pelnyConcept}
              version={pelnaWersja}
              versions={pelneWersje}
              onShowVersion={setWersjaPelna}
              onClose={zamknijPelna}
              onDeleted={() => {
                setPelny(null)
                setPodpinam(null)
              }}
              selecting={podpinam === pelny}
              onToggleSelecting={() => {
                if (podpinam === pelny) return setPodpinam(null)
                setPdf(true)
                setPodpinam(pelny)
              }}
              onJumpToSource={(r) => (isPdfSource(r) ? skok(r) : otworzPelna(r.conceptId))}
              onOpenConcept={otworzPelna}
            />
          </section>
        ) : (
        <section className="ez3-kolumna linear-view">
          <div className="linear-toolbar ez3-pasek">
            <RichToolbar editor={(wybrany && edytory.current.get(wybrany)) || null} />
          </div>
          <div className="linear-column ez3-linia">
            {zadania.map((z, i) => (
              <KafelekZadania
                key={z.id}
                z={z}
                nr={i + 1}
                wl={wybrany === z.id}
                nowe={nowy === z.id}
                doPoprawy={poprawki.has(z.id)}
                typ={typZad}
                podpinam={podpinam === z.id}
                onWybierz={() => {
                  if (wybrany !== z.id) setWybrany(z.id)
                }}
                onNazwa={(t) => (proba ? zmienLok(z.id, (x) => ({ ...x, nazwa: t })) : zapis.pisz(`n:${z.id}`, t))}
                onTresc={(t) => (proba ? zmienLok(z.id, (x) => ({ ...x, tresc: t })) : zapis.pisz(`t:${z.id}`, t))}
                onRozwiazanie={(sid, t) =>
                  proba
                    ? zmienLok(z.id, (x) => ({ ...x, rozwiazania: x.rozwiazania.map((y) => (y.id === sid ? { ...y, tresc: t } : y)) }))
                    : zapis.pisz(`r:${sid}`, t)
                }
                onDodajRozwiazanie={async () => {
                  zapis.wypchnij()
                  if (proba) {
                    const id = `proba-r-${Date.now()}`
                    zmienLok(z.id, (x) => ({
                      ...x,
                      rozwiazania: [...x.rozwiazania, { id, nazwa: nazwaRozwiazania(x.rozwiazania.length), tresc: '' }],
                    }))
                    return id
                  }
                  return dodajRozwiazanie(z.id)
                }}
                onUsunRozwiazanie={(sid) => void usunStrone(z, sid)}
                onUsun={() => void usun(z)}
                onZrodloPdf={() => {
                  if (podpinam === z.id) return setPodpinam(null)
                  setPdf(true)
                  setPodpinam(z.id)
                }}
                onZrodloKafelek={() => setWybor({ rodzaj: 'zrodlo', id: z.id })}
                onSkok={skok}
                onOdepnij={(r) => ustawZrodla(z.id, (l) => l.filter((x) => x.id !== r.id))}
                onEdytor={(ed) => zarejestruj(z.id, ed)}
                onMenu={(x, y) => setMenu({ x, y, id: z.id })}
                onOko={(sid, w) => {
                  if (proba || !z.wersjaId)
                    zmienLok(z.id, (x) =>
                      sid ? { ...x, rozwiazania: x.rozwiazania.map((y) => (y.id === sid ? { ...y, wTescie: w } : y)) } : { ...x, glownaWTescie: w },
                    )
                  else void ustawWidocznosc(z.wersjaId, sid, w)
                }}
              />
            ))}

            <div className="linear-append ez3-doloz">
              <p>
                {zadania.length
                  ? 'Kolejne zadanie — puste do napisania, od czatu albo z biblioteki.'
                  : 'Jeszcze nie ma zadań w tym sektorze. Polecenie widać w teście, rozwiązanie jest zakryte — tak sprawdzisz metodę, nie tylko definicje.'}
              </p>
              <div className="linear-append-actions">
                <span className="linear-append-label">Dołóż:</span>
                <button className="btn btn-dolacz" onClick={() => void nowe()} data-nowe-zadanie title="Nowy kafelek-zadanie: polecenie i rozwiązanie">
                  <span className="type-mini menu-mini" data-typ={typZad} style={typy.style(typZad)}>
                    {znak}
                  </span>
                  Zadanie
                </button>
                <button
                  className={`btn btn-dolacz ${czat ? 'btn-active' : ''}`}
                  onClick={() => {
                    zapis.wypchnij()
                    setCzat((c) => !c)
                    przewin('[data-panel-czatu]')
                  }}
                  data-z-czatem
                  title="Czat da zadania, ty rozwiązujesz, on poprawia — na końcu kod do wklejenia"
                >
                  <span className="ez2-czat-znak" aria-hidden>
                    ✦
                  </span>
                  Z czatem
                </button>
                <button
                  className="btn btn-dolacz"
                  onClick={() => setWybor({ rodzaj: 'zadanie' })}
                  data-z-biblioteki
                  title="Istniejący kafelek z biblioteki jako zadanie tego sektora"
                >
                  <Icon name="library" size={0.95} />Z biblioteki
                </button>
              </div>
            </div>

            {czat && (
              <ZadaniaZCzatem
                znak={znak}
                kolor={kolor}
                proba={!!proba}
                zloz={zloz}
                onZamknij={() => setCzat(false)}
                onDodaj={async (l) => {
                  const ids = await dodaj(l.map((z) => ({ nazwa: z.nazwa, tresc: z.tresc, rozwiazania: z.rozwiazania })))
                  window.dispatchEvent(new CustomEvent('komp:komunikat', { detail: `Dodane do zadań: ${ids.length}` }))
                  setCzat(false)
                  if (ids[0]) pokaz(ids[0])
                }}
              />
            )}
          </div>
        </section>
        )}

        {pdf && (
          <aside className="ez3-pdf" aria-label="PDF">
            {zadanieDoPodpiecia && (
              <div className="ez3-podpinanie" data-podpinanie>
                <span>
                  Zaznacz myszą fragment strony — podepnie się jako źródło do „{zadanieDoPodpiecia.nazwa || 'zadania'}".
                </span>
                <button className="tcz-link" onClick={() => setPodpinam(null)}>
                  Anuluj (Esc)
                </button>
              </div>
            )}
            <PdfPanel
              selecting={!!zadanieDoPodpiecia}
              onRegionSelected={naFragment}
              target={cel}
              onHide={() => {
                setPdf(false)
                setPodpinam(null)
              }}
            />
          </aside>
        )}
      </div>

      <div className="tcz tcz-stopka-wrap">
        <div className="tcz-stopka ez-koniec">
          {proba ? (
            <p className="settings-hint settings-status">
              W prawdziwej nauce teraz: {zadania.length ? `test zakryty z zadaniami (${zadania.length})` : 'test zakryty bez zadań'} —
              potem koniec powtórki zero.
            </p>
          ) : wPowtorceZero ? (
            <>
              <span className="tcz-werdykt-co ez2-stopka-opis">
                {zadania.length
                  ? `Dalej test zakryty: kafelki sektora i zadania (${zadania.length}) — polecenie widać, rozwiązanie zakryte.`
                  : 'Bez zadań tym razem — test zakryty samych kafelków i koniec powtórki zero.'}
              </span>
              <button
                className="btn btn-primary tcz-zapisz"
                onClick={() => {
                  zapis.wypchnij()
                  onTest()
                }}
                data-test-koncowy
              >
                {zadania.length ? `Zapisz — test zakryty z zadaniami (${zadania.length})` : 'Pomiń zadania — test zakryty'}
              </button>
            </>
          ) : (
            <>
              <span className="tcz-werdykt-co ez2-stopka-opis">
                {j.etap === 'powtorki'
                  ? 'Sektor jest już nauczony: nowe zadania pojawią się przy nim jako „Doucz nowe" — mapujesz tylko je, przerwa i test tylko z nich. Termin sektora zostaje.'
                  : 'Zadania zostają w sektorze — nauczysz się ich razem z nim.'}
              </span>
              <button
                className="btn btn-primary tcz-zapisz"
                onClick={() => {
                  zapis.wypchnij()
                  onGotowe?.()
                }}
                data-gotowe-zadania
              >
                Gotowe
              </button>
            </>
          )}
        </div>
      </div>

      {menu &&
        (() => {
          const z = zadania.find((x) => x.id === menu.id)
          if (!z) return null
          const zrob = (f: () => void) => () => {
            setMenu(null)
            f()
          }
          // menu nad całym oknem — żaden panel ani przewijana kolumna go nie przytnie
          return createPortal(
            <div
              className="tree-menu ez3-menu"
              style={{ left: Math.min(menu.x, window.innerWidth - 270), top: Math.min(menu.y, window.innerHeight - 200) }}
              onPointerDown={(e) => e.stopPropagation()}
              role="menu"
            >
              <button
                className="tree-menu-item"
                data-pelna-edycja
                title={proba ? 'W próbie zadania są tylko w pamięci — pełna edycja działa w prawdziwym sektorze' : 'Ten sam edytor co w bibliotece: wersje, strony, źródła, podgląd'}
                onClick={zrob(() => void otworzPelna(z.id))}
              >
                <Icon name="edycja" size={0.95} /> Pełna edycja (jak w bibliotece)
              </button>
              <button
                className="tree-menu-item"
                onClick={zrob(() => {
                  setPdf(true)
                  setPodpinam(z.id)
                })}
              >
                <Icon name="book-open" size={0.95} /> Źródło z PDF
              </button>
              <button className="tree-menu-item" onClick={zrob(() => setWybor({ rodzaj: 'zrodlo', id: z.id }))}>
                <Icon name="library" size={0.95} /> Kafelek jako źródło
              </button>
              <button className="tree-menu-item ez3-menu-usun" onClick={zrob(() => void usun(z))}>
                <Icon name="usun" size={0.95} /> Usuń zadanie
              </button>
            </div>,
            document.body,
          )
        })()}

      {wybor && (
        <ConceptPicker
          title={wybor.rodzaj === 'zrodlo' ? '🧱 Który kafelek jest źródłem tego zadania?' : '🧱 Który kafelek dołożyć jako zadanie?'}
          excludeIds={wybor.rodzaj === 'zrodlo' ? [wybor.id] : zadania.map((z) => z.id)}
          onPick={(c) => void naKafelek(c)}
          onClose={() => setWybor(null)}
        />
      )}
    </div>
  )
}

const PRZYKLAD_ZADAN = `\`\`\`
ZADANIE: Kula w metryce dyskretnej
TREŚĆ:
Opisz kulę o promieniu 1/2 i kulę o promieniu 2 w metryce dyskretnej.
ROZWIĄZANIE:
Metoda: podstaw definicję metryki dyskretnej do definicji kuli. Promień 1/2 — tylko środek; promień 2 — cała przestrzeń.
ROZWIĄZANIE 2:
Z rysunku: odległość to 0 albo 1, więc kula „przeskakuje" od punktu do całości przy promieniu 1.
---
ZADANIE: Czy zbiór jest otwarty?
TREŚĆ:
Czy przedział [0, 1) jest otwarty w R? Uzasadnij.
ROZWIĄZANIE:
Nie: punkt 0 nie ma kuli zawartej w zbiorze. Metoda: sprawdź warunek z definicji w punktach brzegowych.
\`\`\``
