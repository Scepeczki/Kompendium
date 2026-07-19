import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateVersion } from './db'
import type { SourceRef } from './types'
import { Sidebar } from './components/Sidebar'
import { BlockEditor } from './components/BlockEditor'
import { GraphView } from './components/GraphView'
import { PathCanvas } from './components/PathCanvas'
import { PdfPanel, type PdfTarget } from './components/PdfPanel'
import { SettingsModal } from './components/SettingsModal'

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** null = pokazuj bieżącą wersję pojęcia. */
  const [shownVersionId, setShownVersionId] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [pdfTarget, setPdfTarget] = useState<PdfTarget | null>(null)
  /** Widok środkowego panelu: edytor klocka albo graf powiązań. */
  const [showGraph, setShowGraph] = useState(false)
  /** Otwarta ścieżka (canvas). */
  const [openPathId, setOpenPathId] = useState<string | null>(null)
  /** Ścieżka, do której wracamy po zamknięciu klocka otwartego z jej poziomu. */
  const [returnPathId, setReturnPathId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  // Układ paneli — zapamiętywany między sesjami.
  const [showPdf, setShowPdf] = useState(
    () => localStorage.getItem('ui.showPdf') !== '0',
  )
  const [sidebarW, setSidebarW] = useState(
    () => Number(localStorage.getItem('ui.sidebarW')) || 280,
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

  const selectConcept = (id: string) => {
    // jeśli klocek otwierany jest z poziomu ścieżki — zapamiętaj, dokąd wrócić
    setReturnPathId(openPathId)
    setSelectedId(id)
    setShownVersionId(null)
    setSelecting(false)
    setShowGraph(false)
    setOpenPathId(null)
  }

  const openPath = (id: string) => {
    setOpenPathId(id)
    setReturnPathId(null)
    setShowGraph(false)
    setSelecting(false)
  }

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

  /** Tryb podpinania źródła — jeśli panel PDF jest schowany, pokaż go. */
  const toggleSelecting = () => {
    setSelecting((s) => {
      if (!s) setShowPdf(true)
      return !s
    })
  }

  /** Użytkownik narysował prostokąt w PDF → podpinamy źródło do pokazywanej wersji. */
  const handleRegionSelected = async (base: Omit<SourceRef, 'id'>) => {
    if (!effectiveVersionId) return
    const v = await db.versions.get(effectiveVersionId)
    if (!v) return
    await updateVersion(v.id, {
      sourceRefs: [...v.sourceRefs, { id: crypto.randomUUID(), ...base }],
    })
    setSelecting(false)
  }

  const cols = [`${sidebarW}px`, '5px', 'minmax(300px, 1fr)']
  if (showPdf) cols.push('5px', `${pdfW}px`)
  else cols.push('30px')

  return (
    <div className="app" style={{ gridTemplateColumns: cols.join(' ') }}>
      <Sidebar
        selectedId={selectedId}
        onSelect={selectConcept}
        graphActive={showGraph}
        onToggleGraph={() => setShowGraph((g) => !g)}
        openPathId={openPathId}
        onOpenPath={openPath}
        onOpenSettings={() => setShowSettings(true)}
      />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <Splitter onDrag={(dx) => setSidebarW((w) => clamp(w + dx, 200, 480))} />

      {showGraph ? (
        <GraphView onOpen={selectConcept} />
      ) : openPathId ? (
        <PathCanvas
          pathId={openPathId}
          onClose={() => setOpenPathId(null)}
          onOpenConcept={selectConcept}
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
          onJumpToSource={(ref) => {
            setShowPdf(true)
            setPdfTarget({ pdfId: ref.pdfId, page: ref.page, rect: ref.rect })
          }}
          onOpenConcept={selectConcept}
        />
      ) : (
        <section className="editor editor-welcome">
          <div>
            <h2>Zacznij budować kompendium</h2>
            <p>
              Utwórz pierwszy <strong>klocek wiedzy</strong> przyciskiem po lewej,
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
          />
        </>
      ) : (
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
