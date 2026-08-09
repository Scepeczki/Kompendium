import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { useLiveQuery } from 'dexie-react-hooks'
import { RichEditor } from './RichEditor'
import { ConceptPicker } from './ConceptPicker'
import { mdShortcuts, surroundSelection, wrapLines } from '../cmShortcuts'
import { wikiCompletion } from '../cmWiki'
import {
  createConcept,
  createSubpage,
  db,
  deleteConcept,
  deleteSubpage,
  deleteVersion,
  mainPageName,
  pathsWithConcept,
  renameSubpage,
  reorderSubpages,
  renameVersion,
  reorderVersions,
  saveAsNewVersion,
  updateConcept,
  updateSubpage,
  updateVersion,
} from '../db'
import { extractLinks, renderMarkdown } from '../markdown'
import {
  isPdfSource,
  type BlockType,
  type BlockVersion,
  type Concept,
  type SourceRef,
} from '../types'
import { useBlockTypes } from '../blockTypes'
import { useDialogs } from './Dialogs'

type ViewMode = 'wizualny' | 'kod' | 'podzial'

/** Typ przeciągania chipów źródeł między grupami. */
const SRC_MIME = 'text/x-kompendium-src'

interface Props {
  concept: Concept
  version: BlockVersion
  versions: BlockVersion[]
  onShowVersion: (versionId: string | null) => void
  onClose: () => void
  onDeleted: () => void
  selecting: boolean
  onToggleSelecting: () => void
  onJumpToSource: (ref: SourceRef) => void
  /** Otwiera inny klocek (nawigacja wiki-linkiem / odwołaniem zwrotnym). */
  onOpenConcept: (id: string) => void
  /** Otwiera ścieżkę — z paska „w ścieżkach". */
  onOpenPath?: (id: string) => void
}

export function BlockEditor({
  concept,
  version,
  versions,
  onShowVersion,
  onClose,
  onDeleted,
  selecting,
  onToggleSelecting,
  onJumpToSource,
  onOpenConcept,
  onOpenPath,
}: Props) {
  const typy = useBlockTypes()
  const dlg = useDialogs()
  const [view, setView] = useState<ViewMode>(() => {
    const v = localStorage.getItem('ui.editorView')
    return v === 'kod' || v === 'podzial' ? v : 'wizualny'
  })
  useEffect(() => {
    localStorage.setItem('ui.editorView', view)
  }, [view])
  const [draft, setDraft] = useState(version.content)
  const saveTimer = useRef<number | undefined>(undefined)
  /** Zwinięte grupy źródeł (stan lokalny widoku). */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  /** Podpowiedź przy przeciąganiu pigułek wersji. */
  const [pillHint, setPillHint] = useState<{ id: string; pos: 'before' | 'after' } | null>(
    null,
  )
  const nameRef = useRef<HTMLInputElement>(null)

  // Nazwa buforowana lokalnie: pisanie nie czeka na bazę (zapis z opóźnieniem).
  const [nameDraft, setNameDraft] = useState(concept.name)
  const nameTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    // synchronizuj z bazą, o ile użytkownik właśnie nie pisze w tym polu
    if (document.activeElement !== nameRef.current) setNameDraft(concept.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept.id, concept.name])
  const onNameChange = (v: string) => {
    setNameDraft(v)
    window.clearTimeout(nameTimer.current)
    nameTimer.current = window.setTimeout(() => {
      updateConcept(concept.id, { name: v })
    }, 300)
  }

  // świeżo utworzony klocek: nazwa od razu zaznaczona do nadpisania
  useEffect(() => {
    if (concept.name === 'Nowe pojęcie') {
      nameRef.current?.focus()
      nameRef.current?.select()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept.id])
  /** Cel przeciągania chipa: nazwa grupy albo '' (obszar „bez grupy"). */
  const [srcHint, setSrcHint] = useState<string | null>(null)

  const isCurrent = version.id === concept.currentVersionId
  const pdfs = useLiveQuery(() => db.pdfs.toArray(), []) ?? []
  /** Ścieżki, w których ten klocek się pojawia (także w scalonych blokach). */
  const wSciezkach = useLiveQuery(() => pathsWithConcept(concept.id), [concept.id]) ?? []

  // Strony klocka (dowody itp.) — dodatkowe treści obok głównej.
  const subs =
    useLiveQuery(
      () =>
        db.subpages
          .where('[conceptId+versionId]')
          .equals([concept.id, version.id])
          .sortBy('order'),
      [concept.id, version.id],
    ) ?? []
  const [subId, setSubId] = useState<string | null>(null)
  /** Przeciąganie stron: która jedzie i nad którą wisi. */
  const ciagnietaRef = useRef<string | null>(null)
  const [nadStrona, setNadStrona] = useState<string | null>(null)
  // zmiana klocka → wróć na główną treść (synchronizacja w trakcie renderu)
  const [prevConceptId, setPrevConceptId] = useState(concept.id)
  if (prevConceptId !== concept.id) {
    setPrevConceptId(concept.id)
    setSubId(null)
  }
  const activeSub = subs.find((s) => s.id === subId) ?? null

  const handleAddSubpage = async () => {
    const name = await dlg.prompt({
      title: 'Nowa strona klocka',
      message: 'Najczęściej „Dowód", ale nazwa jest dowolna.',
      value: 'Dowód',
      confirmLabel: 'Utwórz stronę',
    })
    if (!name) return
    const id = await createSubpage(concept.id, version.id, name)
    setSubId(id)
  }

  const handleRenameSubpage = async (id: string, current: string) => {
    const name = await dlg.prompt({ title: 'Nazwa strony', value: current })
    if (!name || name === current) return
    await renameSubpage(id, name)
  }

  const handleDeleteSubpage = async (id: string, name: string) => {
    const ok = await dlg.confirm({
      title: `Usunąć stronę „${name}"?`,
      message: 'Jej treść przepadnie. Pozostałe strony klocka zostają.',
      confirmLabel: 'Usuń stronę',
      danger: true,
    })
    if (!ok) return
    await deleteSubpage(id)
    if (subId === id) setSubId(null)
  }

  /** Strona główna też ma nazwę — bywa, że „Treść" nie pasuje. */
  const handleRenameMainPage = async () => {
    const name = await dlg.prompt({
      title: 'Nazwa strony głównej',
      message: 'Puste pole przywraca „Treść".',
      value: mainPageName(concept),
      allowEmpty: true,
    })
    if (name === null) return
    await updateConcept(concept.id, { mainPageName: name || undefined })
  }
  const pdfTitle = (id: string) => pdfs.find((p) => p.id === id)?.title ?? 'PDF'

  // Wszystkie pojęcia + treści ich bieżących wersji — do wiki-linków i odwołań.
  const allConcepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []
  const conceptTitle = (id: string) =>
    allConcepts.find((c) => c.id === id)?.name ?? '(usunięty klocek)'

  // Rozszerzenia CodeMirror muszą mieć stabilną tożsamość (rekonfiguracja przy
  // każdym renderze psuje m.in. akceptowanie podpowiedzi klawiszem).
  const conceptNamesRef = useRef<string[]>([])
  conceptNamesRef.current = allConcepts.map((c) => c.name)
  const cmExtensions = useMemo(
    () => [
      markdown(),
      mdShortcuts,
      surroundSelection,
      wrapLines,
      wikiCompletion(() => conceptNamesRef.current),
    ],
    [],
  )
  const allVersions = useLiveQuery(() => db.versions.toArray(), []) ?? []
  const currentContent = (c: Concept) =>
    allVersions.find((v) => v.id === c.currentVersionId)?.content ?? ''

  const findByName = (name: string) => {
    const lower = name.toLowerCase()
    return (
      allConcepts.find((c) => c.name === name) ??
      allConcepts.find((c) => c.name.toLowerCase() === lower)
    )
  }

  /** Klocki, których bieżąca wersja linkuje do tego pojęcia. */
  const backlinks = allConcepts.filter(
    (c) =>
      c.id !== concept.id &&
      extractLinks(currentContent(c)).some(
        (n) => n.toLowerCase() === concept.name.toLowerCase(),
      ),
  )

  /** Obsługa kliknięć w wiki-linki w podglądzie. */
  const handlePreviewClick = async (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a.wikilink')
    if (!a) return
    e.preventDefault()
    const name = a.getAttribute('data-target') ?? ''
    const found = findByName(name)
    if (found) {
      onOpenConcept(found.id)
      return
    }
    const ok = await dlg.confirm({
      title: `Nie ma jeszcze klocka „${name}"`,
      message: 'Utworzyć go teraz i od razu otworzyć?',
      confirmLabel: 'Utwórz klocek',
    })
    if (ok) {
      const id = await createConcept()
      await updateConcept(id, { name })
      onOpenConcept(id)
    }
  }

  // Zmiana pokazywanej wersji lub strony → załaduj jej treść do edytora.
  // Synchronizacja w trakcie renderu (nie w efekcie), żeby montowany niżej
  // edytor wizualny nigdy nie zobaczył treści poprzedniego klocka.
  const contentKey = `${version.id}:${activeSub?.id ?? 'main'}`
  const [prevKey, setPrevKey] = useState(contentKey)
  /** Czy ktoś w ogóle postawił kursor w polu od czasu ostatniego przełączenia.
   *
   *  Bez tego samo przejście na inną stronę klocka zapisywało treść od nowa:
   *  edytor wizualny wczytuje Markdown i oddaje go z powrotem, a to nie
   *  zawsze wraca znak w znak — puste linie zamieniały się w akapity ze
   *  spacją i po kilku przełączeniach robił się z tekstu jednolity mur.
   *  Przełączenie strony nie jest zmianą treści i nie ma prawa nic zapisać. */
  const dotknieteRef = useRef(false)
  if (prevKey !== contentKey) {
    setPrevKey(contentKey)
    setDraft(activeSub ? activeSub.content : version.content)
    dotknieteRef.current = false
  }
  // to samo przy przełączeniu Kod ↔ Wizualny: pole powstaje od nowa i od razu
  // oddaje treść „po swojemu", a to nie jest zmiana zrobiona przez człowieka
  const [prevWidok, setPrevWidok] = useState(view)
  if (prevWidok !== view) {
    setPrevWidok(view)
    dotknieteRef.current = false
  }

  /** Wszystko jest do pisania — także starsza wersja.
   *
   *  Wersje są u nas różnymi ujęciami tej samej rzeczy („wg Rudina"), a nie
   *  zapisem przeszłości, więc nie ma czego bronić przed poprawianiem. Do
   *  niedawna starsza wersja była tylko do odczytu i literówki w niej nie
   *  dało się naprawić inaczej niż przez zrobienie z niej bieżącej. */
  const editable = true

  // Autozapis z opóźnieniem (strona klocka albo bieżąca wersja).
  const onChange = (val: string) => {
    // Zmiana z samego wczytania treści, a nie spod ręki — ignorujemy ją
    // w całości. Nie tylko zapisu: gdybyśmy wzięli ją choćby do brudnopisu,
    // pierwsze prawdziwe naciśnięcie klawisza zapisałoby już przekręcony
    // tekst i puste linie i tak by przepadły.
    if (!dotknieteRef.current) return
    setDraft(val)
    if (!editable) return
    window.clearTimeout(saveTimer.current)
    const subToSave = activeSub?.id
    saveTimer.current = window.setTimeout(() => {
      if (subToSave) updateSubpage(subToSave, { content: val })
      else updateVersion(version.id, { content: val })
    }, 400)
  }

  const preview = useMemo(
    () => renderMarkdown(draft, { exists: (name) => !!findByName(name) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, allConcepts],
  )

  const handleNewVersion = async () => {
    const label = await dlg.prompt({
      title: 'Nowa wersja klocka',
      message: 'Kopiuje bieżącą treść jako kolejną wersję. Etykieta jest opcjonalna.',
      placeholder: 'np. wg Rudina',
      allowEmpty: true,
      confirmLabel: 'Utwórz wersję',
    })
    if (label === null) return
    const id = await saveAsNewVersion(concept.id, label || undefined)
    onShowVersion(id)
  }

  const handleRenameVersion = async (v: BlockVersion) => {
    const label = await dlg.prompt({
      title: `Etykieta wersji v${v.version}`,
      message: 'Puste pole zostawia samą numerację.',
      value: v.label ?? '',
      allowEmpty: true,
    })
    if (label === null) return
    await renameVersion(v.id, label || undefined)
  }

  const handleDeleteVersion = async (v: BlockVersion) => {
    const ok = await dlg.confirm({
      title: `Usunąć wersję v${v.version}${v.label ? ` (${v.label})` : ''}?`,
      message: 'Jej treść przepadnie. Pozostałe wersje klocka zostają.',
      confirmLabel: 'Usuń wersję',
      danger: true,
    })
    if (ok) {
      await deleteVersion(v.id)
      onShowVersion(null)
    }
  }

  const handleDelete = async () => {
    const ok = await dlg.confirm({
      title: `Usunąć klocek „${concept.name}"?`,
      message:
        'Znikną wszystkie jego wersje, strony i powiązania. Tego nie da się cofnąć.',
      confirmLabel: 'Usuń klocek',
      danger: true,
    })
    if (ok) {
      await deleteConcept(concept.id)
      onDeleted()
    }
  }

  /** Okno wyboru klocka-źródła. */
  const [pickingSource, setPickingSource] = useState(false)

  /** Podpina inny klocek jako źródło tej wersji (genealogia wiedzy). */
  const addBlockSource = async (source: Concept) => {
    setPickingSource(false)
    const already = version.sourceRefs.some(
      (r) => !isPdfSource(r) && r.conceptId === source.id,
    )
    if (already) return
    await updateVersion(version.id, {
      sourceRefs: [
        ...version.sourceRefs,
        {
          id: crypto.randomUUID(),
          kind: 'block' as const,
          conceptId: source.id,
          versionId: null,
        },
      ],
    })
  }

  const removeSourceRef = async (refId: string) => {
    await updateVersion(version.id, {
      sourceRefs: version.sourceRefs.filter((r) => r.id !== refId),
    })
  }

  /** Nazwy grup: jawnie utworzone + te wynikające z przypisań (stare dane). */
  const groupNames = [
    ...new Set([
      ...(version.sourceGroups ?? []),
      ...version.sourceRefs.map((r) => r.group).filter((g): g is string => !!g),
    ]),
  ].sort((a, b) => a.localeCompare(b, 'pl'))

  const refsIn = (group: string | null) =>
    version.sourceRefs.filter((r) => (r.group ?? null) === group)

  /** Przenosi chip źródła do grupy (undefined = bez grupy). */
  const setRefGroup = async (refId: string, group: string | undefined) => {
    await updateVersion(version.id, {
      sourceRefs: version.sourceRefs.map((r) =>
        r.id === refId ? { ...r, group } : r,
      ),
    })
  }

  const handleNewGroup = async () => {
    const n = await dlg.prompt({
      title: 'Nowa grupa źródeł',
      message: 'Prosty sposób na uporządkowanie chipów przy dłuższej liście.',
      placeholder: 'np. Rysunki',
      confirmLabel: 'Utwórz grupę',
    })
    if (!n || groupNames.includes(n)) return
    await updateVersion(version.id, { sourceGroups: [...groupNames, n] })
  }

  const handleRenameGroup = async (group: string) => {
    const n = await dlg.prompt({ title: 'Nazwa grupy źródeł', value: group })
    if (!n || n === group) return
    await updateVersion(version.id, {
      sourceGroups: groupNames.map((g) => (g === group ? n : g)),
      sourceRefs: version.sourceRefs.map((r) =>
        r.group === group ? { ...r, group: n } : r,
      ),
    })
  }

  const handleDeleteGroup = async (group: string) => {
    const ok = await dlg.confirm({
      title: `Usunąć grupę „${group}"?`,
      message: 'Same źródła zostają — wrócą do listy bez grupy.',
      confirmLabel: 'Usuń grupę',
      danger: true,
    })
    if (!ok) return
    await updateVersion(version.id, {
      sourceGroups: groupNames.filter((g) => g !== group),
      sourceRefs: version.sourceRefs.map((r) =>
        r.group === group ? { ...r, group: undefined } : r,
      ),
    })
  }

  const toggleGroup = (group: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })

  /** Chip źródła — przeciągalny między grupami. */
  const sourceChip = (r: SourceRef) => (
    <span
      key={r.id}
      className="source-chip"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(SRC_MIME, r.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <button
        className="source-jump"
        title={
          isPdfSource(r) ? 'Skocz do miejsca w PDF' : 'Otwórz klocek będący źródłem'
        }
        onClick={() => onJumpToSource(r)}
      >
        {isPdfSource(r)
          ? `📖 ${pdfTitle(r.pdfId)} · s. ${r.page}`
          : `🧱 ${conceptTitle(r.conceptId)}`}
      </button>
      {(
        <button
          className="source-remove"
          title="Odepnij źródło"
          onClick={() => removeSourceRef(r.id)}
        >
          ×
        </button>
      )}
    </span>
  )

  const setTags = (raw: string) => {
    const tags = raw
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean)
    updateConcept(concept.id, { tags })
  }

  const sorted = [...versions].sort((a, b) => a.version - b.version)

  return (
    <section className="editor">
      <header className="editor-header">
        <div className="editor-title-row">
          <select
            className="input type-select"
            data-typ={concept.type}
            style={typy.style(concept.type)}
            value={concept.type}
            onChange={(e) =>
              updateConcept(concept.id, { type: e.target.value as BlockType })
            }
          >
            {typy.choices.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
            {/* typ schowany albo skasowany nadal musi dać się pokazać,
                inaczej wybór skoczyłby na pierwszy z brzegu */}
            {!typy.choices.some((t) => t.id === concept.type) && (
              <option value={concept.type}>{typy.label(concept.type)}</option>
            )}
          </select>
          <input
            ref={nameRef}
            className="input editor-name"
            value={nameDraft}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Nazwa pojęcia…"
          />
          <button className="btn btn-danger" title="Usuń pojęcie" onClick={handleDelete}>
            Usuń
          </button>
          <button
            className="btn btn-close"
            title="Zamknij klocek (wróć do widoku startowego)"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="editor-meta-row">
          <input
            className="input editor-tags"
            defaultValue={concept.tags.join(', ')}
            key={concept.id}
            onBlur={(e) => setTags(e.target.value)}
            placeholder="tagi, po, przecinku…"
          />
          <div className="version-bar">
            {sorted.map((v) => {
              const hint = pillHint?.id === v.id ? pillHint.pos : null
              return (
                <div
                  key={v.id}
                  draggable
                  className={`version-pill ${v.id === version.id ? 'active' : ''} ${
                    hint === 'before' ? 'drop-left' : hint === 'after' ? 'drop-right' : ''
                  }`}
                  title={`wersja ${v.version}${v.label ? ` — ${v.label}` : ''} · przeciągnij, aby zmienić kolejność`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/x-komp-ver', v.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    const r = e.currentTarget.getBoundingClientRect()
                    const pos = e.clientX - r.left < r.width / 2 ? 'before' : 'after'
                    setPillHint({ id: v.id, pos })
                  }}
                  onDragLeave={() => setPillHint(null)}
                  onDrop={async (e) => {
                    e.preventDefault()
                    const dragId = e.dataTransfer.getData('text/x-komp-ver')
                    const pos = pillHint?.id === v.id ? pillHint.pos : 'after'
                    setPillHint(null)
                    if (!dragId || dragId === v.id) return
                    const ids = sorted.map((x) => x.id).filter((x) => x !== dragId)
                    const idx = ids.indexOf(v.id)
                    ids.splice(pos === 'before' ? idx : idx + 1, 0, dragId)
                    await reorderVersions(concept.id, ids)
                  }}
                >
                  <button
                    className="version-pill-label"
                    onClick={() => {
                      setSubId(null) // wersje dotyczą głównej treści
                      onShowVersion(v.id === concept.currentVersionId ? null : v.id)
                    }}
                  >
                    {v.label ?? `v${v.version}`}
                  </button>
                  {v.id === version.id && (
                    <span className="version-actions">
                      <button
                        className="version-action"
                        title="Zmień etykietę wersji"
                        onClick={() => handleRenameVersion(v)}
                      >
                        ✎
                      </button>
                      {sorted.length > 1 && (
                        <button
                          className="version-action"
                          title="Usuń tę wersję"
                          onClick={() => handleDeleteVersion(v)}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  )}
                </div>
              )
            })}
            <button className="version-pill new" onClick={handleNewVersion}>
              + nowa wersja
            </button>
          </div>
        </div>
      </header>

      {!isCurrent && !activeSub && (
        <div className="editor-banner">
          Piszesz po wersji v{version.version}, a bieżąca jest inna — ta treść
          i te źródła należą tylko do niej.
        </div>
      )}

      {/* Gdzie ten klocek pracuje. Sama treść nie mówi, czy jest wpleciony
          w jakiś skrypt, a to bywa ważniejsze niż to, co w nim napisano. */}
      {wSciezkach.length > 0 && (
        <div className="editor-sciezki">
          <span className="editor-sciezki-tytul">W ścieżkach:</span>
          {wSciezkach.map((p) => (
            <button
              key={p.id}
              className="editor-sciezka"
              title={onOpenPath ? `Otwórz ścieżkę „${p.name}"` : p.name}
              onClick={() => onOpenPath?.(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="editor-toolbar">
        <div className="toolbar-left">
          <button
            className={`btn ${selecting ? 'btn-active' : ''}`}
            onClick={onToggleSelecting}
            title="Zaznacz fragment PDF i podepnij go jako źródło (wspólne dla wszystkich stron tej wersji)"
          >
            Podepnij źródło
          </button>
          <button
            className="btn"
            onClick={() => setPickingSource(true)}
            title="Wskaż inny klocek jako źródło tego klocka (np. przy podsumowaniu)"
          >
            Klocek jako źródło
          </button>
          <button
            className="btn"
            onClick={handleNewGroup}
            title="Nowa grupa źródeł"
          >
            + 🗀
          </button>
        </div>
        <div className="view-switch">
          {(['wizualny', 'kod', 'podzial'] as ViewMode[]).map((m) => (
            <button
              key={m}
              className={`btn ${view === m ? 'btn-active' : ''}`}
              title={
                m === 'wizualny'
                  ? 'Edycja wizualna (jak Google Docs)'
                  : m === 'kod'
                    ? 'Czysty kod Markdown+LaTeX (jak Overleaf)'
                    : 'Kod i podgląd obok siebie'
              }
              onClick={() => setView(m)}
            >
              {m === 'wizualny' ? 'Wizualny' : m === 'kod' ? 'Kod' : 'Podział'}
            </button>
          ))}
        </div>
      </div>

      {(version.sourceRefs.length > 0 || groupNames.length > 0) && (
        <div
          className={`source-row ${srcHint === '' ? 'drop-root' : ''}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(SRC_MIME)) return
            e.preventDefault()
            setSrcHint('')
          }}
          onDragLeave={() => setSrcHint(null)}
          onDrop={(e) => {
            e.preventDefault()
            const id = e.dataTransfer.getData(SRC_MIME)
            setSrcHint(null)
            if (id) setRefGroup(id, undefined)
          }}
        >
          <span
            className="source-label"
            title="Źródła należą do wersji — są wspólne dla wszystkich jej stron"
          >
            Źródła:
          </span>
          {refsIn(null).map((r) => sourceChip(r))}
          {groupNames.map((g) => {
            const open = !collapsedGroups.has(g)
            return (
              <span key={g} className="source-group">
                <button
                  className={`source-group-head ${srcHint === g ? 'drop-into' : ''}`}
                  title={open ? 'Zwiń grupę' : 'Rozwiń grupę'}
                  onClick={() => toggleGroup(g)}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes(SRC_MIME)) return
                    e.preventDefault()
                    e.stopPropagation()
                    setSrcHint(g)
                  }}
                  onDragLeave={() => setSrcHint(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const id = e.dataTransfer.getData(SRC_MIME)
                    setSrcHint(null)
                    if (id) setRefGroup(id, g)
                  }}
                >
                  <span className={`folder-chevron ${open ? 'open' : ''}`}>▸</span>
                  🗀 {g}
                  <span className="folder-count">{refsIn(g).length}</span>
                </button>
                {(
                  <span className="source-group-actions">
                    <button
                      className="folder-action"
                      title="Zmień nazwę grupy"
                      onClick={() => handleRenameGroup(g)}
                    >
                      ✎
                    </button>
                    <button
                      className="folder-action"
                      title="Usuń grupę (źródła wrócą do listy)"
                      onClick={() => handleDeleteGroup(g)}
                    >
                      ×
                    </button>
                  </span>
                )}
                {open && refsIn(g).map((r) => sourceChip(r))}
              </span>
            )
          })}
        </div>
      )}

      <div className={`editor-body view-${view}`}>
        {/* strony klocka: główna treść + dowody itp. — wąska kolumna kart */}
        <div className="subpage-rail nodrag">
          <div
            className={`subpage-item ${!activeSub ? 'active' : ''}`}
            title="Główna treść klocka"
            onClick={() => setSubId(null)}
          >
            <span className="subpage-name">{mainPageName(concept)}</span>
            {!activeSub && (
              <span className="subpage-actions">
                <button
                  className="folder-action"
                  title="Zmień nazwę strony głównej"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRenameMainPage()
                  }}
                >
                  ✎
                </button>
              </span>
            )}
          </div>
          {subs.map((s) => (
            <div
              key={s.id}
              className={`subpage-item ${activeSub?.id === s.id ? 'active' : ''} ${
                nadStrona === s.id ? 'nad' : ''
              }`}
              onClick={() => setSubId(s.id)}
              title={`Strona „${s.name}" — przeciągnij, aby zmienić kolejność`}
              draggable
              onDragStart={(e) => {
                ciagnietaRef.current = s.id
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', s.id)
              }}
              onDragOver={(e) => {
                if (!ciagnietaRef.current || ciagnietaRef.current === s.id) return
                e.preventDefault()
                setNadStrona(s.id)
              }}
              onDragLeave={() => setNadStrona((x) => (x === s.id ? null : x))}
              onDrop={(e) => {
                e.preventDefault()
                setNadStrona(null)
                const skad = ciagnietaRef.current
                ciagnietaRef.current = null
                if (!skad || skad === s.id) return
                const kolejnosc = subs.map((x) => x.id).filter((x) => x !== skad)
                kolejnosc.splice(kolejnosc.indexOf(s.id), 0, skad)
                reorderSubpages(kolejnosc)
              }}
            >
              <span className="subpage-name">{s.name}</span>
              {activeSub?.id === s.id && (
                <span className="subpage-actions">
                  <button
                    className="folder-action"
                    title="Zmień nazwę strony"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRenameSubpage(s.id, s.name)
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="folder-action"
                    title="Usuń stronę"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteSubpage(s.id, s.name)
                    }}
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
          ))}
          <button
            className="subpage-add"
            title="Dodaj stronę klocka (np. dowód) — nazwa dowolna"
            onClick={handleAddSubpage}
          >
            + strona
          </button>
        </div>
        {view === 'wizualny' ? (
          <div
            className="editor-pole"
            // kursor w polu = od teraz zmiany są od użytkownika
            onFocusCapture={() => {
              dotknieteRef.current = true
            }}
          >
            <RichEditor
              key={contentKey}
              value={draft}
              editable={editable}
              onChange={onChange}
            />
          </div>
        ) : (
          <>
            <div
              className="editor-code"
              onFocusCapture={() => {
                dotknieteRef.current = true
              }}
            >
              <CodeMirror
                value={draft}
                onChange={onChange}
                extensions={cmExtensions}
                editable={editable}
                placeholder={'Treść klocka…\n\nMarkdown + LaTeX: $x^2$, $$\\int_a^b f\\,dx$$'}
                basicSetup={{ lineNumbers: false, foldGutter: false, autocompletion: false }}
                style={{ height: '100%' }}
              />
            </div>
            {view === 'podzial' && (
              <div
                className="editor-preview markdown-body"
                onClick={handlePreviewClick}
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            )}
          </>
        )}
      </div>

      {pickingSource && (
        <ConceptPicker
          title="🧱 Który klocek jest źródłem?"
          excludeIds={[concept.id]}
          onPick={addBlockSource}
          onClose={() => setPickingSource(false)}
        />
      )}

      {backlinks.length > 0 && (
        <footer className="backlinks-row">
          <span className="source-label">Odwołania:</span>
          {backlinks.map((c) => (
            <button
              key={c.id}
              className="backlink-chip"
              title={`Otwórz „${c.name}"`}
              onClick={() => onOpenConcept(c.id)}
            >
              <span className="type-mini" data-typ={c.type} style={typy.style(c.type)}>
                {typy.short(c.type)}
              </span>
              {c.name}
            </button>
          ))}
        </footer>
      )}
    </section>
  )
}
