import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { renderMarkdown } from '../markdown'
import { SourceList } from './SourceList'
import {
  kluczWlasnej,
  type BlockType,
  type BlockVersion,
  type Concept,
  type FusionPart,
  type SourceRef,
  type StronaBloku,
  type Subpage,
} from '../types'
import { useBlockTypes } from '../blockTypes'
import { useState } from 'react'

export type GroupPart = FusionPart

interface Props {
  name: string
  /** Czym jest złożona całość — wygląda wtedy jak zwykły blok tego typu. */
  type?: BlockType
  /** Materiały, z których blok złożono. Do rysowania nie są już potrzebne;
   *  służą sklejce dla starych danych i źródłom. */
  parts: GroupPart[]
  /** Złożony tekst. Brak = blok jeszcze nie komponowany, pokazujemy sklejkę
   *  z materiałów (patrz `trescBloku`). */
  content?: string
  strony?: StronaBloku[]
  zrodla?: SourceRef[]
  onJumpToSource?: (ref: SourceRef) => void
  onRename?: (name: string) => void
  /** Kafelki/wersje/strony podane z zewnątrz. Linia ma je już wczytane dla
   *  całej ścieżki; bez tego każdy blok czytałby trzy całe tabele. */
  zewn?: { concepts: Concept[]; versions: BlockVersion[]; subpages: Subpage[] }
  /** Pole do pisania na treść wskazanej strony (widok Linia). */
  edytor?: (klucz: string, tresc: string, zapisz: (md: string) => void) => React.ReactNode
  /** Zapis treści: `null` = strona główna. */
  onEditContent?: (md: string, stronaId: string | null) => void
  onStartEdit?: () => void
  /** Numer w Skrypcie — blok czyta się wtedy jak akapit książki. */
  numer?: string
  /** Plakietka w nagłówku: złożony tekst istnieje tylko w tej ścieżce. */
  pochodzenie?: boolean
}

/** Sklejka treści materiałów — tak wyglądał scalony blok w starym modelu.
 *
 *  Używana tylko wtedy, gdy blok nie ma jeszcze własnego tekstu. Dzięki temu
 *  ścieżki zapisane przed przebudową wyglądają dokładnie tak samo, a w danych
 *  nic się nie zmienia, dopóki użytkownik czegoś nie napisze. */
export function sklejMaterialy(
  parts: FusionPart[],
  concepts: Concept[],
  versions: BlockVersion[],
  subpages: Subpage[],
): string {
  return parts
    .map((p) => {
      const concept = concepts.find((c) => c.id === p.conceptId)
      const wersja =
        versions.find((v) => v.id === p.versionId) ??
        versions.find((v) => v.id === concept?.currentVersionId)
      const strona = p.subpageId ? subpages.find((s) => s.id === p.subpageId) : null
      // najpierw tekst napisany przy tym materiale W ŚCIEŻCE
      const wlasna = wersja
        ? p.wlasneTresci?.[kluczWlasnej(wersja.id, strona?.id ?? null)]
        : undefined
      return (wlasna ?? (strona ? strona.content : (wersja?.content ?? ''))).trim()
    })
    .filter(Boolean)
    .join('\n\n')
}

/** ZŁOŻONY KAFELEK w ścieżce: nagłówek z nazwą, zakładki własnych stron
 *  i jeden tekst. Kafelki, z których go złożono, zostają w bibliotece —
 *  tutaj są tylko materiałem, po który wraca się na ekranie komponowania. */
export function GroupShell({
  name,
  type,
  parts,
  content,
  strony,
  zrodla,
  onJumpToSource,
  onRename,
  zewn,
  edytor,
  onEditContent,
  onStartEdit,
  numer,
  pochodzenie,
}: Props) {
  const typy = useBlockTypes()
  /** Która strona złożonego kafelka jest pokazana; null = główna. */
  const [wybrana, setWybrana] = useState<string | null>(null)

  const wlasneKlocki =
    useLiveQuery(
      () => (zewn ? Promise.resolve([] as Concept[]) : db.concepts.toArray()),
      [!!zewn],
    ) ?? []
  const wlasneWersje =
    useLiveQuery(
      () => (zewn ? Promise.resolve([] as BlockVersion[]) : db.versions.toArray()),
      [!!zewn],
    ) ?? []
  const wlasneStrony =
    useLiveQuery(
      () => (zewn ? Promise.resolve([] as Subpage[]) : db.subpages.toArray()),
      [!!zewn],
    ) ?? []
  const concepts = zewn?.concepts ?? wlasneKlocki
  const versions = zewn?.versions ?? wlasneWersje
  const subpages = zewn?.subpages ?? wlasneStrony

  const listaStron = strony ?? []
  const strona = listaStron.find((s) => s.id === wybrana) ?? null
  // strona zapamiętana, a potem skasowana — wracamy na główną
  const stronaId = strona ? strona.id : null

  const trescGlowna = content ?? sklejMaterialy(parts, concepts, versions, subpages)
  const tresc = strona ? strona.content : trescGlowna

  /** Źródła: te przeniesione przy komponowaniu, a dla starych bloków —
   *  źródła materiałów, żeby nic nie zniknęło z oczu. */
  const refs: SourceRef[] =
    zrodla ??
    parts.flatMap((p) => {
      const concept = concepts.find((c) => c.id === p.conceptId)
      const wersja =
        versions.find((v) => v.id === p.versionId) ??
        versions.find((v) => v.id === concept?.currentVersionId)
      return wersja?.sourceRefs ?? []
    })

  const ksiazka = numer !== undefined
  const slowo = type ? typy.label(type) : 'Blok'
  const znak = type ? typy.short(type) : 'BLOK'
  const zakladki = listaStron.length > 0 && (
    <div className="block-pages">
      <button
        className={`block-page ${strona ? '' : 'active'}`}
        onClick={() => setWybrana(null)}
      >
        Treść
      </button>
      {listaStron.map((s) => (
        <button
          key={s.id}
          className={`block-page ${strona?.id === s.id ? 'active' : ''}`}
          onClick={() => setWybrana(s.id)}
        >
          {s.name}
        </button>
      ))}
    </div>
  )

  return (
    <section
      className={`script-block script-group-block ${ksiazka ? 'ks-blok' : ''}`}
      data-typ={type}
      data-skad={pochodzenie ? 'zlozony' : undefined}
      style={type ? typy.style(type) : undefined}
    >
      {ksiazka && (
        <div className="ks-numer">
          <span className="ks-liczba">{numer}</span>
          <span className="script-block-type type-mini" title={slowo}>
            {znak}
          </span>
        </div>
      )}
      <div className="script-block-glowa">
      <header className="script-block-head">
        <h3 className="script-block-title">
          {ksiazka ? (
            <span className="ks-slowo">
              {slowo} {numer}
            </span>
          ) : (
            <span className="script-block-type type-mini" title={slowo}>
              {znak}
            </span>
          )}{' '}
          {onRename ? (
            <input
              className="inline-title"
              value={name}
              placeholder="bez nazwy — kliknij i nazwij"
              title="Nazwa złożonego kafelka — istnieje tylko w tej ścieżce"
              onChange={(e) => onRename(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : ksiazka ? (
            name && <span className="ks-nazwa">{name}</span>
          ) : (
            name || 'bez nazwy'
          )}
        </h3>
        {!ksiazka && zakladki}
        {pochodzenie && (
          <span className="block-pochodzenie" data-rodzaj="sciezka">
            złożony tutaj
          </span>
        )}
      </header>

      <div className="script-block-body">
        <div className="block-content">
          {ksiazka && zakladki}
          {edytor && onEditContent ? (
            edytor(stronaId ?? 'tresc', tresc, (md) => onEditContent(md, stronaId))
          ) : (
            <div
              className={`markdown-body ${onStartEdit ? 'do-pisania' : ''}`}
              onClick={(e) => {
                if ((e.target as Element).closest('a, button, select')) return
                if (e.ctrlKey || e.metaKey || e.shiftKey) return
                onStartEdit?.()
              }}
              dangerouslySetInnerHTML={{
                // Świeżo scalony blok jest PUSTY z założenia: składa się go
                // z materiału. Podpowiadamy, gdzie ten materiał czeka, żeby
                // pustka nie wyglądała na zgubiony tekst.
                __html: renderMarkdown(
                  tresc ||
                    '<p class="note-empty">pusto — prawy przycisk → „Komponuj”, ' +
                      'materiał czeka po lewej</p>',
                ),
              }}
            />
          )}
        </div>
      </div>
      </div>
      <SourceList refs={refs} onJump={onJumpToSource} />
    </section>
  )
}
