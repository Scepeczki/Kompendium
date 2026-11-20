import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateVersion } from './db'
import { isBlockSource, isPdfSource, type PdfSourceRef, type SourceRef } from './types'
import { NowaWersja } from './components/NowaWersja'
import { Sidebar } from './components/Sidebar'
import { BlockEditor } from './components/BlockEditor'
import { GraphView } from './components/GraphView'
import { PathCanvas } from './components/PathCanvas'
import { PdfPanel, type PdfTarget } from './components/PdfPanel'
import { SettingsPage } from './components/SettingsPage'
import { DialogProvider } from './components/Dialogs'
import { Icon } from './components/Icon'
import { Powtorki } from './components/Powtorki'
import { SesjaNauki, type CelSesji } from './components/SesjaNauki'
import { minutyDouczania, minutyPrzerwy, planNauki } from './nauka'
import { wez } from './naukaUstawienia'
import { powiadom } from './pulpit'

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** Czy jesteśmy na wąskim ekranie (telefon).
 *
 *  Rzeczy przeznaczone tylko na telefon chowaliśmy dotąd arkuszem stylów, ale
 *  schowany element nadal jest w drzewie — i potrafi przechwycić kliknięcie
 *  albo podszyć się pod inny w wyszukiwaniu. Lepiej, żeby na dużym ekranie
 *  po prostu ich nie było. */
function useTelefon(): boolean {
  const [waski, setWaski] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const zmiana = () => setWaski(mq.matches)
    mq.addEventListener('change', zmiana)
    return () => mq.removeEventListener('change', zmiana)
  }, [])
  return waski
}

/** Pionowa krawędź do zmiany szerokości sąsiedniego panelu. */
function Splitter({ onDrag }: { onDrag: (dx: number) => void }) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    let last = e.clientX
    const move = (ev: MouseEvent) => {
      onDrag(ev.clientX - last)
      last = ev.clientX
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.classList.remove('resizing')
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    document.body.classList.add('resizing')
  }
  return <div className="splitter" onMouseDown={handleMouseDown} />
}

export default function App() {
  return (
    <DialogProvider>
      <Widok />
    </DialogProvider>
  )
}

/** Cały układ programu. Osobno od App, żeby pytania (okienka potwierdzeń)
 *  były dostępne dla wszystkiego, co jest w środku. */
function Widok() {
  // Ctrl+S: zapis jest automatyczny — blokujemy tylko dialog przeglądarki
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') e.preventDefault()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** null = pokazuj bieżącą wersję pojęcia. */
  const [shownVersionId, setShownVersionId] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [pdfTarget, setPdfTarget] = useState<PdfTarget | null>(null)
  /** Widok środkowego panelu: edytor kafelka albo graf powiązań. */
  const [showGraph, setShowGraph] = useState(false)
  /** Otwarta ścieżka (canvas). */
  const [openPathId, setOpenPathId] = useState<string | null>(null)
  /** Kafelek, do którego ścieżka ma podskoczyć zaraz po otwarciu. */
  const [celKlocka, setCelKlocka] = useState<string | null>(null)
  /** Ścieżka, do której wracamy po zamknięciu kafelka otwartego z jej poziomu. */
  const [returnPathId, setReturnPathId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  /** Strona Powtórek i otwarta sesja (test / powtórka). */
  const [showPowtorki, setShowPowtorki] = useState(false)
  const [sesja, setSesja] = useState<CelSesji | null>(null)
  /** Ile na dziś — licznik przy przycisku Powtórek. */
  const planDzis = useLiveQuery(() => planNauki(), [])
  const doPowtorki = planDzis?.dzis.length ?? 0

  // Sesja otwierana zdarzeniem (np. próba z Ustawień).
  useEffect(() => {
    const h = (e: Event) => {
      setShowSettings(false)
      setSesja((e as CustomEvent<CelSesji>).detail)
    }
    window.addEventListener('komp:sesja', h)
    return () => window.removeEventListener('komp:sesja', h)
  }, [])

  // Po przerwie (powtórka zero) — przypomnienie o teście. Raz na przerwę;
  // systemowe powiadomienie tylko, jeśli przeglądarka na nie pozwoliła.
  useEffect(() => {
    const juz = new Set<string>()
    let ostatniPlan = 0
    const sprawdz = async () => {
      const wPrzerwie = await db.nauka.where('etap').equals('przerwa').toArray()
      // douczanie nowych ma własną przerwę
      const douczane = (await db.nauka.where('etap').equals('powtorki').toArray()).filter(
        (j) => j.douczanie?.etap === 'przerwa',
      )
      for (const j of [...wPrzerwie, ...douczane]) {
        const dz = j.etap === 'powtorki'
        const klucz = `${j.id}|${dz ? j.douczanie!.od : j.etapOd}`
        if (juz.has(klucz) || (dz ? minutyDouczania(j) : minutyPrzerwy(j)) < wez('przypomnij')) continue
        juz.add(klucz)
        const tekst = dz
          ? `Przerwa minęła — czas na test nowych w sektorze „${j.nazwa}".`
          : `Przerwa minęła — czas na test sektora „${j.nazwa}".`
        window.dispatchEvent(new CustomEvent('komp:komunikat', { detail: tekst }))
        void powiadom(tekst)
      }

      // Codzienne przypomnienie o powtórkach — raz dziennie, od ustawionej godziny.
      const godz = wez('godzinaPowtorek')
      const t = new Date()
      if (godz > 0 && t.getHours() >= godz) {
        let byloDzis = false
        try {
          byloDzis = localStorage.getItem('nauka.przypomnianoPowtorki') === t.toDateString()
        } catch {
          // bez pamięci przypomni najwyżej drugi raz
        }
        // plan liczy się z całej bazy — gdy nic nie czeka, pytamy co 10 min, nie co 30 s
        if (!byloDzis && Date.now() - ostatniPlan >= 10 * 60_000) {
          ostatniPlan = Date.now()
          const ile = (await planNauki()).dzis.length
          if (ile > 0) {
            try {
              localStorage.setItem('nauka.przypomnianoPowtorki', t.toDateString())
            } catch {
              // jw.
            }
            void powiadom(`Na dziś czeka powtórka: ${ile}. Zajrzyj do Powtórek.`)
          }
        }
      }
    }
    void sprawdz()
    const t = window.setInterval(() => void sprawdz(), 30000)
    return () => window.clearInterval(t)
  }, [])
  const [gornySlot, setGornySlot] = useState<HTMLDivElement | null>(null)

  // Układ paneli — zapamiętywany między sesjami.
  const [showPdf, setShowPdf] = useState(() => {
    // Nowy układ ma po prawej panel kafelka, a otwarty PDF go wypiera. Raz
    // chowamy PDF, potem to już wybór użytkownika.
    const znacznik = 'ui.pdfNowyUklad.v1'
    if (!localStorage.getItem(znacznik)) {
      localStorage.setItem(znacznik, '1')
      if (localStorage.getItem('ui.showPdf') === '1') return false
    }
    return localStorage.getItem('ui.showPdf') !== '0'
  })
  const [sidebarW, setSidebarW] = useState(
    () => Number(localStorage.getItem('ui.sidebarW')) || 250,
  )
  const [pdfW, setPdfW] = useState(
    () => Number(localStorage.getItem('ui.pdfW')) || 520,
  )

  useEffect(() => {
    localStorage.setItem('ui.showPdf', showPdf ? '1' : '0')
  }, [showPdf])
  useEffect(() => {
    localStorage.setItem('ui.sidebarW', String(sidebarW))
  }, [sidebarW])
  useEffect(() => {
    localStorage.setItem('ui.pdfW', String(pdfW))
  }, [pdfW])

  const concept = useLiveQuery(
    () => (selectedId ? db.concepts.get(selectedId) : undefined),
    [selectedId],
  )
  const versions =
    useLiveQuery(
      () =>
        selectedId
          ? db.versions.where('conceptId').equals(selectedId).toArray()
          : [],
      [selectedId],
    ) ?? []

  const effectiveVersionId = shownVersionId ?? concept?.currentVersionId
  const version = versions.find((v) => v.id === effectiveVersionId)

  /** Telefon: lista wjeżdża z boku i chowa się, gdy coś z niej wybierzesz.
   *  Na dużym ekranie ten stan nic nie robi — lista stoi tam na stałe. */
  const [szuflada, setSzuflada] = useState(false)
  const telefon = useTelefon()

  const selectConcept = (id: string) => {
    setSzuflada(false)
    // jeśli kafelek otwierany jest z poziomu ścieżki — zapamiętaj, dokąd wrócić
    setReturnPathId(openPathId)
    setSelectedId(id)
    setShownVersionId(null)
    setSelecting(false)
    setShowGraph(false)
    setOpenPathId(null)
    // Ustawienia zajmują cały środkowy panel, więc wybór czegokolwiek
    // z listy musi je zamknąć — inaczej klik w kafelek nic nie robi.
    setShowSettings(false)
    setShowPowtorki(false)
    setSesja(null)
  }

  /** Otwiera ścieżkę; z drugim argumentem od razu skacze do miejsca, w którym
   *  siedzi w niej ten kafelek (przycisk „w ścieżkach" w edytorze). */
  const openPath = (id: string, conceptId?: string) => {
    setSzuflada(false)
    setOpenPathId(id)
    setCelKlocka(conceptId ?? null)
    setReturnPathId(null)
    setShowGraph(false)
    setSelecting(false)
    setShowSettings(false)
    setShowPowtorki(false)
    setSesja(null)
  }

  /** Zakotwiczona ścieżka: ta, do której chce się wracać.
   *
   *  Pracuje się przy niej długo — zaglądasz do kafelka, do innej ścieżki, do
   *  PDF-u — i za każdym razem trzeba było jej szukać na liście. Kotwica
   *  trzyma jedną ścieżkę pod ręką: przycisk w lewym górnym rogu i Alt+Z. */
  const [zakotwiczona, setZakotwiczona] = useState<string | null>(
    () => localStorage.getItem('ui.kotwica'),
  )
  useEffect(() => {
    if (zakotwiczona) localStorage.setItem('ui.kotwica', zakotwiczona)
    else localStorage.removeItem('ui.kotwica')
  }, [zakotwiczona])
  /** Wynik NIESIE ZE SOBĄ id, dla którego powstał.
   *
   *  Żywe zapytanie oddaje przez chwilę poprzednią odpowiedź, a ta mówiła
   *  „takiej ścieżki nie ma" (bo kotwicy jeszcze nie było). Bez sprawdzenia,
   *  czego dotyczy, kotwica zdejmowałaby się sama w ułamku sekundy po
   *  założeniu. `undefined` = jeszcze nie wiadomo, `null` = naprawdę nie ma. */
  const kotwicaWynik = useLiveQuery(
    async () => ({
      id: zakotwiczona,
      sciezka: zakotwiczona ? ((await db.paths.get(zakotwiczona)) ?? null) : null,
    }),
    [zakotwiczona],
  )
  const kotwicaSciezka =
    kotwicaWynik && kotwicaWynik.id === zakotwiczona ? kotwicaWynik.sciezka : undefined
  // ścieżka mogła zostać usunięta — wtedy kotwica nie ma czego trzymać
  useEffect(() => {
    if (zakotwiczona && kotwicaSciezka === null) setZakotwiczona(null)
  }, [zakotwiczona, kotwicaSciezka])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== 'z' && e.key !== 'Z')) return
      if (!zakotwiczona) return
      e.preventDefault()
      openPath(zakotwiczona)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zakotwiczona])

  const closeConcept = () => {
    setSelectedId(null)
    setShownVersionId(null)
    setSelecting(false)
    // powrót do ścieżki, z której przyszliśmy
    if (returnPathId) {
      setOpenPathId(returnPathId)
      setReturnPathId(null)
    }
  }

  /** Skok do źródła: wycinek PDF pokazujemy w panelu, a źródło-kafelek
   *  otwieramy w edytorze (tak wędruje się w górę genealogii wiedzy). */
  const jumpToSource = (ref: SourceRef) => {
    if (isPdfSource(ref)) {
      setShowPdf(true)
      setPdfTarget({ pdfId: ref.pdfId, page: ref.page, rect: ref.rect })
    } else if (isBlockSource(ref)) {
      selectConcept(ref.conceptId)
      if (ref.versionId) setShownVersionId(ref.versionId)
    }
  }

  /** Tryb podpinania źródła — jeśli panel PDF jest schowany, pokaż go. */
  const toggleSelecting = () => {
    setSelecting((s) => {
      if (!s) setShowPdf(true)
      return !s
    })
  }

  /** Użytkownik narysował prostokąt w PDF → podpinamy źródło do pokazywanej wersji. */
  const handleRegionSelected = async (base: Omit<PdfSourceRef, 'id'>) => {
    if (!effectiveVersionId) return
    const v = await db.versions.get(effectiveVersionId)
    if (!v) return
    await updateVersion(v.id, {
      sourceRefs: [...v.sourceRefs, { id: crypto.randomUUID(), ...base }],
    })
    setSelecting(false)
  }

  const cols = [`${sidebarW}px`, '5px', 'minmax(300px, 1fr)']
  // Przy otwartej ścieżce przycisk PDF stoi na górnym pasku, więc boczny
  // pasek do przywracania tylko zabierałby miejsce.
  const sciezkaNaEkranie = !!openPathId && !showSettings && !showGraph && !showPowtorki && !sesja
  if (showPdf) cols.push('5px', `${pdfW}px`)
  else if (!sciezkaNaEkranie) cols.push('30px')

  return (
    <div
      className={`app ${szuflada ? 'szuflada-otwarta' : ''}`}
      style={{ gridTemplateColumns: cols.join(' ') }}
    >
      <NowaWersja />
      <header className="gorny-pasek">
        <h1 className="app-title">Kompendium</h1>
        {/* Pasek otwartej ścieżki wchodzi tu przez portal, żeby jej nazwa stała
            tuż obok nazwy programu, ponad wszystkimi kolumnami. */}
        <div className="gorny-slot" ref={setGornySlot} />
      </header>
      {/* Telefon: lista nie mieści się obok treści, więc wjeżdża z boku.
          Na dużym ekranie tych dwóch rzeczy w ogóle nie widać. */}
      <button
        className="szuflada-przycisk"
        title="Pokaż listę"
        aria-label="Pokaż listę"
        onClick={() => setSzuflada(true)}
      >
        ☰
      </button>
      {/* Ustawienia mają na telefonie własne, przyklejone wejście — obok ☰.
          To stamtąd pobiera się notatki z komputera, więc nie może zależeć od
          tego, czy stopka listy zmieści się na ekranie: wysokość okna podawana
          przez przeglądarkę telefonu bywa większa niż to, co naprawdę widać. */}
      {telefon && (
        <button
          className="ustawienia-przycisk"
          title="Ustawienia"
          aria-label="Ustawienia"
          onClick={() => {
            setSzuflada(false)
            setShowSettings(true)
          }}
        >
          <Icon name="ustawienia" size={1.05} />
        </button>
      )}
      <div className="szuflada-cien" onClick={() => setSzuflada(false)} />
      <Sidebar
        selectedId={selectedId}
        onSelect={selectConcept}
        graphActive={showGraph}
        onToggleGraph={() => {
          setSzuflada(false)
          setShowGraph((g) => !g)
          setShowSettings(false)
          setShowPowtorki(false)
          setSesja(null)
        }}
        openPathId={openPathId}
        onOpenPath={openPath}
        doPowtorki={doPowtorki}
        powtorkiActive={showPowtorki && !showSettings}
        onOpenPowtorki={() => {
          setSzuflada(false)
          setShowPowtorki(true)
          setShowSettings(false)
          setShowGraph(false)
          setSesja(null)
        }}
        onOpenSettings={() => {
          // wszystko, co otwiera się na całą szerokość, chowa szufladę —
          // inaczej lista zostaje na wierzchu i zasłania to, co otwarłeś
          setSzuflada(false)
          setShowSettings(true)
        }}
      />
      <Splitter onDrag={(dx) => setSidebarW((w) => clamp(w + dx, 200, 480))} />

      {/* Kotwica: droga powrotna do ścieżki, przy której się pracuje.
          Pokazuje się tylko wtedy, gdy jesteśmy gdzie indziej. */}
      {kotwicaSciezka && openPathId !== kotwicaSciezka.id && (
        <button
          className="kotwica-powrot"
          title={`Wróć do ścieżki „${kotwicaSciezka.name}" (Alt+Z)`}
          onClick={() => openPath(kotwicaSciezka.id)}
        >
          <Icon name="anchor" size={1} />
          <span className="kotwica-nazwa">{kotwicaSciezka.name}</span>
          <span className="kotwica-skrot">Alt+Z</span>
        </button>
      )}

      {showSettings ? (
        <SettingsPage onClose={() => setShowSettings(false)} />
      ) : sesja ? (
        <SesjaNauki
          key={JSON.stringify(sesja)}
          cel={sesja}
          onZamknij={() => setSesja(null)}
          onJumpToSource={jumpToSource}
        />
      ) : showPowtorki ? (
        <Powtorki
          onStart={setSesja}
          onOpenPath={(id) => openPath(id)}
          onClose={() => setShowPowtorki(false)}
        />
      ) : showGraph ? (
        <GraphView onOpen={selectConcept} />
      ) : openPathId ? (
        <PathCanvas
          pathId={openPathId}
          celKlocek={celKlocka}
          zakotwiczona={zakotwiczona === openPathId}
          onZakotwicz={() =>
            setZakotwiczona((z) => (z === openPathId ? null : openPathId))
          }
          onClose={() => setOpenPathId(null)}
          onOpenConcept={selectConcept}
          onJumpToSource={jumpToSource}
          pasekCel={gornySlot}
          pdfWidoczny={showPdf}
          onPrzelaczPdf={() => setShowPdf((p) => !p)}
          onStartNauka={setSesja}
        />
      ) : concept && version ? (
        <BlockEditor
          concept={concept}
          version={version}
          versions={versions}
          onShowVersion={setShownVersionId}
          onClose={closeConcept}
          onDeleted={closeConcept}
          selecting={selecting}
          onToggleSelecting={toggleSelecting}
          onJumpToSource={jumpToSource}
          onOpenConcept={selectConcept}
          onOpenPath={openPath}
        />
      ) : (
        <section className="editor editor-welcome">
          <div>
            <h2>Zacznij budować kompendium</h2>
            <p>
              Utwórz pierwszy <strong>kafelek wiedzy</strong> przyciskiem po lewej,
              wrzuć <strong>PDF</strong> po prawej i podpinaj treść pod źródło.
            </p>
            <p className="hint">
              Treść piszesz w Markdownie z LaTeX-em: <code>$x^2$</code> albo{' '}
              <code>$$\int_a^b f\,dx$$</code>.
            </p>
          </div>
        </section>
      )}

      {showPdf ? (
        <>
          <Splitter
            onDrag={(dx) =>
              setPdfW((w) =>
                clamp(w - dx, 280, Math.floor(window.innerWidth * 0.7)),
              )
            }
          />
          <PdfPanel
            selecting={selecting && !!version}
            onRegionSelected={handleRegionSelected}
            target={pdfTarget}
            onHide={() => {
              setShowPdf(false)
              setSelecting(false)
            }}
            onOpenConcept={selectConcept}
          />
        </>
      ) : sciezkaNaEkranie ? null : (
        <button
          className="pdf-reopen"
          title="Pokaż panel PDF"
          onClick={() => setShowPdf(true)}
        >
          <span>📖 PDF</span>
        </button>
      )}
    </div>
  )
}
