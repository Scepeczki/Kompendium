import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateVersion } from './db'
import type { SourceRef } from './types'
import { Sidebar } from './components/Sidebar'
import { BlockEditor } from './components/BlockEditor'
import { PdfPanel, type PdfTarget } from './components/PdfPanel'

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** null = pokazuj bieżącą wersję pojęcia. */
  const [shownVersionId, setShownVersionId] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [pdfTarget, setPdfTarget] = useState<PdfTarget | null>(null)

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
    setSelectedId(id)
    setShownVersionId(null)
    setSelecting(false)
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

  return (
    <div className="app">
      <Sidebar selectedId={selectedId} onSelect={selectConcept} />

      {concept && version ? (
        <BlockEditor
          concept={concept}
          version={version}
          versions={versions}
          onShowVersion={setShownVersionId}
          onDeleted={() => {
            setSelectedId(null)
            setShownVersionId(null)
          }}
          selecting={selecting}
          onToggleSelecting={() => setSelecting((s) => !s)}
          onJumpToSource={(ref) =>
            setPdfTarget({ pdfId: ref.pdfId, page: ref.page, rect: ref.rect })
          }
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

      <PdfPanel
        selecting={selecting && !!version}
        onRegionSelected={handleRegionSelected}
        target={pdfTarget}
      />
    </div>
  )
}
