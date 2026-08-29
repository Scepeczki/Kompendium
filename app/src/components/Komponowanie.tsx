import { useEffect, useMemo, useRef, useState } from 'react'
import { type Editor } from '@tiptap/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, mainPageName } from '../db'
import { renderMarkdown } from '../markdown'
import { RichEditor, wytnijMarkdown } from './RichEditor'
import { sklejMaterialy } from './GroupShell'
import { ConceptPicker } from './ConceptPicker'
import { useBlockTypes } from '../blockTypes'
import { useDialogs } from './Dialogs'
import {
  kluczWlasnej,
  type BlockType,
  type FusionPart,
  type SourceRef,
  type StronaBloku,
} from '../types'

interface Props {
  name: string
  type?: BlockType
  /** Materiały — kafelki, z których się składa. */
  parts: FusionPart[]
  /** Brak = blok sprzed przebudowy; startujemy od sklejki materiałów. */
  content?: string
  strony: StronaBloku[]
  zrodla: SourceRef[]
  onZmiana: (co: {
    name?: string
    type?: BlockType | undefined
    content?: string
    strony?: StronaBloku[]
    parts?: FusionPart[]
    zrodla?: SourceRef[]
  }) => void
  onClose: () => void
}

/** Jedna pozycja w lewej kolumnie: strona któregoś z materiałów. */
interface Kawalek {
  klucz: string
  conceptId: string
  kafelek: string
  strona: string
  tresc: string
  zrodla: SourceRef[]
}

/** EKRAN KOMPONOWANIA — tu ze scalanych kafelków składa się jeden.
 *
 *  Po lewej materiał: kafelki i ich strony. Na środku powstający kafelek.
 *  Wstawianie KOPIUJE tekst — złożony kafelek ma własną treść, a nie zlepek
 *  cudzych fragmentów pilnowanych niewidzialnymi granicami. Materiały zostają
 *  przy bloku na zawsze, więc zawsze można tu wrócić i dobrać coś jeszcze. */
export function Komponowanie({
  name,
  type,
  parts,
  content,
  strony,
  zrodla,
  onZmiana,
  onClose,
}: Props) {
  const typy = useBlockTypes()
  const dlg = useDialogs()
  const [wybranaStrona, setWybranaStrona] = useState<string | null>(null)
  const [podglad, setPodglad] = useState<string | null>(null)
  const [dobieranie, setDobieranie] = useState(false)
  /** Co już wzięliśmy — żeby było widać, czego się nie przegapiło. */
  const [uzyte, setUzyte] = useState<Set<string>>(new Set())
  /** Gdzie stoi kursor w polu środkowym — tam wpada wstawiany tekst. */
  const [pozycja, setPozycja] = useState<number | null>(null)
  /** Rośnie przy każdym wstawieniu z lewej.
   *
   *  Pole do pisania trzyma własną kopię tekstu i nie podgląda, co się zmieniło
   *  na zewnątrz — bez tego licznika wstawiony kawałek pojawiłby się w danych,
   *  ale nie na ekranie, a najbliższy zapis z pola nadpisałby go starą treścią. */
  const [rewizja, setRewizja] = useState(0)
  /** Zapory na czas podmiany pola.
   *
   *  Pole przy odmontowaniu oddaje jeszcze raz swoją treść, żeby nic nie
   *  przepadło przy zamykaniu. Przy wstawianiu z lewej to działa przeciwko
   *  nam: stare pole oddaje tekst SPRZED wstawienia i po cichu je cofa. */
  const ignorujRef = useRef(false)
  const edytorRef = useRef<Editor | null>(null)
  /** Czy człowiek w ogóle postawił tu kursor.
   *
   *  Samo wczytanie treści do pola wywołuje „zmianę" — Markdown wpuszczony do
   *  edytora i wypisany z powrotem nie zawsze wraca znak w znak. Bez tej
   *  zapory blok, w którym nic nie skomponowano, dostawał własny tekst i tracił
   *  związek z materiałem, choć nikt go nie tknął. */
  const dotknieteRef = useRef(false)

  /** Wyjście: najpierw oddajemy treść, dopiero potem zamykamy.
   *
   *  Pole samo oddaje ją przy odmontowaniu, ale to dzieje się PO zamknięciu —
   *  a wtedy ścieżka zdążyła już odświeżyć swoje pole i zostawał w nim tekst
   *  sprzed ostatnich poprawek. */
  const gotowe = () => {
    // Zapisujemy TYLKO wtedy, gdy ktoś tu naprawdę pisał albo coś wstawił.
    // Porównywanie tekstów nie wystarcza: wzory po przejściu przez edytor
    // wracają minimalnie inaczej zapisane, więc blok nietknięty i tak
    // dostawałby własną treść i tracił związek z materiałem.
    const ed = edytorRef.current
    if (ed && dotknieteRef.current) {
      zapiszWprost(wytnijMarkdown(ed, 0, ed.state.doc.content.size))
    }
    onClose()
  }

  const konceptyQ = useLiveQuery(() => db.concepts.toArray(), [])
  const wersjeQ = useLiveQuery(() => db.versions.toArray(), [])
  const stronyQ = useLiveQuery(() => db.subpages.toArray(), [])
  const concepts = konceptyQ ?? []
  const versions = wersjeQ ?? []
  const subpages = stronyQ ?? []
  /** Dopóki materiał się nie wczytał, nie pokazujemy pola do pisania: przy
   *  bloku sprzed przebudowy startowa treść bierze się właśnie z materiału
   *  i pole dostałoby na chwilę pustkę. */
  const wczytane = !!konceptyQ && !!wersjeQ && !!stronyQ

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dobieranie) gotowe()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, dobieranie])

  /** Materiał rozłożony na strony — z tego się bierze. */
  const material = useMemo(() => {
    const out: { conceptId: string; nazwa: string; typ: string; strony: Kawalek[] }[] = []
    for (const p of parts) {
      const c = concepts.find((x) => x.id === p.conceptId)
      if (!c) continue
      const wersja =
        versions.find((v) => v.id === p.versionId) ??
        versions.find((v) => v.id === c.currentVersionId)
      if (!wersja) continue
      const wlasne = wersja.sourceRefs ?? []
      const swoje = subpages
        .filter((s) => s.versionId === wersja.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      const tekst = (id: string | null, domyslny: string) =>
        p.wlasneTresci?.[kluczWlasnej(wersja.id, id)] ?? domyslny
      out.push({
        conceptId: c.id,
        nazwa: c.name,
        typ: c.type,
        strony: [
          {
            klucz: `${c.id}:glowna`,
            conceptId: c.id,
            kafelek: c.name,
            strona: mainPageName(c),
            tresc: tekst(null, wersja.content),
            zrodla: wlasne,
          },
          ...swoje.map((s) => ({
            klucz: `${c.id}:${s.id}`,
            conceptId: c.id,
            kafelek: c.name,
            strona: s.name,
            tresc: tekst(s.id, s.content),
            zrodla: wlasne,
          })),
        ],
      })
    }
    return out
  }, [parts, concepts, versions, subpages])

  const strona = strony.find((s) => s.id === wybranaStrona) ?? null
  /** Blok sprzed przebudowy nie ma jeszcze własnego tekstu — zaczynamy od
   *  tego, co dotąd pokazywał. Dopiero pierwszy zapis to utrwala. */
  const trescGlowna =
    content ?? sklejMaterialy(parts, concepts, versions, subpages)
  const tresc = strona ? strona.content : trescGlowna

  const zapiszWprost = (md: string) => {
    if (strona) {
      onZmiana({
        strony: strony.map((s) => (s.id === strona.id ? { ...s, content: md } : s)),
      })
    } else {
      onZmiana({ content: md })
    }
  }

  /** Zapis z pola — tylko wtedy, gdy pisze człowiek, i nie w trakcie
   *  podmiany pola po wstawieniu z lewej. */
  const zapiszTresc = (md: string) => {
    if (ignorujRef.current || !dotknieteRef.current) return
    zapiszWprost(md)
  }

  /** Wstawia tekst materiału w miejscu kursora (albo na końcu).
   *
   *  Kopiuje — nie robi żywego odnośnika. Razem z tekstem przenosimy źródła
   *  kafelka, z którego to wzięliśmy: skąd jest wiedza, ma zostać. */
  const wstaw = (k: Kawalek, fragment?: string) => {
    const kawalek = (fragment ?? k.tresc).trim()
    if (!kawalek) return
    const przed = tresc.slice(0, pozycja ?? tresc.length)
    const po = tresc.slice(pozycja ?? tresc.length)
    const sklej = [przed.trimEnd(), kawalek, po.trimStart()].filter(Boolean).join('\n\n')
    zapiszWprost(sklej)
    dotknieteRef.current = true
    ignorujRef.current = true
    setRewizja((r) => r + 1)
    setPozycja((przed.trimEnd() ? przed.trimEnd().length + 2 : 0) + kawalek.length)
    setUzyte((z) => new Set(z).add(k.klucz))
    // źródła kafelka dopisują się raz — bez dubli
    const brakujace = k.zrodla.filter((r) => !zrodla.some((x) => x.id === r.id))
    if (brakujace.length > 0) onZmiana({ zrodla: [...zrodla, ...brakujace] })
  }

  const dodajStrone = async () => {
    const nazwa = await dlg.prompt({
      title: 'Nowa strona złożonego kafelka',
      message: 'Np. „Dowód”, „Szkic”, „Uwagi”.',
      placeholder: 'nazwa strony',
    })
    if (!nazwa) return
    const nowa: StronaBloku = { id: crypto.randomUUID(), name: nazwa.trim(), content: '' }
    onZmiana({ strony: [...strony, nowa] })
    setWybranaStrona(nowa.id)
    setPozycja(null)
  }

  const usunStrone = async (s: StronaBloku) => {
    const ok = await dlg.confirm({
      title: `Usunąć stronę „${s.name}”?`,
      message: s.content.trim()
        ? 'Ma na sobie tekst — zniknie razem z nią.'
        : 'Jest pusta.',
      confirmLabel: 'Usuń',
    })
    if (!ok) return
    onZmiana({ strony: strony.filter((x) => x.id !== s.id) })
    setWybranaStrona(null)
  }

  return (
    <div className="komp-backdrop">
      <div className="komp-okno">
        <header className="komp-head">
          <div className="komp-tytul">
            <span className="script-block-type">
              {type ? typy.label(type) : 'Blok'}:
            </span>
            <input
              className="inline-title komp-nazwa"
              value={name}
              autoFocus
              placeholder="bez nazwy — kliknij i nazwij"
              onChange={(e) => onZmiana({ name: e.target.value })}
            />
          </div>
          <button className="btn" onClick={gotowe}>
            Gotowe
          </button>
        </header>

        <div className="komp-cialo">
          <aside className="komp-material">
            <div className="komp-material-head">
              <span>Materiał</span>
              {material.length > 0 && (
                <span className="komp-licznik">{material.length}</span>
              )}
            </div>
            {material.length === 0 && (
              <p className="settings-hint">
                Nie ma z czego składać — dołóż kafelek poniżej.
              </p>
            )}
            {material.map((m) => (
              <section className="komp-kafelek" key={m.conceptId} style={typy.style(m.typ)}>
                <header className="komp-kafelek-head">
                  <span className="type-mini" data-typ={m.typ} style={typy.style(m.typ)}>
                    {typy.short(m.typ)}
                  </span>
                  <span className="komp-kafelek-nazwa">{m.nazwa}</span>
                </header>
                {m.strony.map((k) => (
                  <div
                    className={`komp-strona ${podglad === k.klucz ? 'otwarta' : ''} ${
                      uzyte.has(k.klucz) ? 'wzieta' : ''
                    }`}
                    key={k.klucz}
                  >
                    <div className="komp-strona-wiersz">
                      <button
                        className="komp-strona-nazwa"
                        onClick={() => setPodglad(podglad === k.klucz ? null : k.klucz)}
                        title="Pokaż treść tej strony"
                      >
                        <span className="komp-znak">
                          {uzyte.has(k.klucz) ? '✓' : podglad === k.klucz ? '⌄' : '›'}
                        </span>
                        <span className="komp-strona-tekst">{k.strona}</span>
                      </button>
                      <button
                        className="btn btn-mini komp-wstaw"
                        onClick={() => wstaw(k)}
                        title="Wstaw całą stronę w miejscu kursora"
                      >
                        Wstaw
                      </button>
                    </div>
                    {podglad === k.klucz && (
                      <div className="komp-podglad">
                        <div
                          className="markdown-body"
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdown(k.tresc || '*(pusto)*'),
                          }}
                        />
                        <div className="komp-podglad-stopka">
                          <span className="komp-podpowiedz">
                            zaznacz fragment, żeby wziąć tylko jego
                          </span>
                          <button
                            className="btn btn-mini"
                            onClick={() => {
                              const zazn = window.getSelection()?.toString() ?? ''
                              if (zazn.trim()) wstaw(k, zazn)
                            }}
                          >
                            Wstaw zaznaczone
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            ))}
            <button className="btn komp-doloz" onClick={() => setDobieranie(true)}>
              + Dołóż kafelek
            </button>
          </aside>

          <main className="komp-srodek">
            <div className="komp-strony">
              <button
                className={`block-page ${strona ? '' : 'active'}`}
                onClick={() => {
                  setWybranaStrona(null)
                  setPozycja(null)
                }}
              >
                Treść
              </button>
              {strony.map((s) => (
                <button
                  key={s.id}
                  className={`block-page ${strona?.id === s.id ? 'active' : ''}`}
                  onClick={() => {
                    setWybranaStrona(s.id)
                    setPozycja(null)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    usunStrone(s)
                  }}
                  title="Prawy przycisk usuwa tę stronę"
                >
                  {s.name}
                </button>
              ))}
              <button className="btn btn-mini" onClick={dodajStrone}>
                + strona
              </button>
            </div>

            <div className="komp-pole">
              {wczytane ? (
                <RichEditor
                  key={`${wybranaStrona ?? 'tresc'}:${rewizja}`}
                  value={tresc}
                  editable
                  ruler={false}
                  onChange={zapiszTresc}
                  onFocus={() => {
                    dotknieteRef.current = true
                  }}
                  onReady={(ed) => {
                    edytorRef.current = ed
                    ignorujRef.current = false
                  }}
                />
              ) : (
                <p className="settings-hint">Wczytuję materiał…</p>
              )}
            </div>

            <div className="komp-typ">
              <span className="settings-label">Czym jest ten kafelek</span>
              <div className="group-type-choice">
                <button
                  className={`btn group-type-btn ${!type ? 'btn-active' : ''}`}
                  onClick={() => onZmiana({ type: undefined })}
                >
                  Blok
                </button>
                {typy.choices.map((t) => (
                  <button
                    key={t.id}
                    className={`btn group-type-btn ${type === t.id ? 'btn-active' : ''}`}
                    style={typy.style(t.id)}
                    onClick={() => onZmiana({ type: t.id })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>

      {dobieranie && (
        <ConceptPicker
          title="Dołóż kafelek do materiału"
          excludeIds={parts.map((p) => p.conceptId)}
          onPick={(c) => {
            setDobieranie(false)
            onZmiana({
              parts: [...parts, { conceptId: c.id, versionId: null, subpageId: null }],
            })
          }}
          onClose={() => setDobieranie(false)}
        />
      )}
    </div>
  )
}
