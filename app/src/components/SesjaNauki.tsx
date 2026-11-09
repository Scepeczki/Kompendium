import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { renderMarkdown } from '../markdown'
import { useBlockTypes } from '../blockTypes'
import { BlockShell } from './BlockShell'
import { GroupShell } from './GroupShell'
import { Icon } from './Icon'
import { TestCzatem } from './TestCzatem'
import { eksperyment, otworzCzat, zlozPolecenie } from '../czat'
import {
  NAZWY_OCEN,
  czyRozszerzona,
  dniDo,
  kluczWezla,
  ocenialny,
  opisDni,
  podglad,
  podpowiedz,
  rodzajRozszerzonej,
  wezlySektora,
  zapiszSesje,
  type Ocena,
  type PoSesji,
} from '../nauka'
import { pytania } from '../naukaUstawienia'
import {
  kluczWlasnej,
  type BlockVersion,
  type Concept,
  type PathNode,
  type Przypomnienie,
  type SourceRef,
} from '../types'

/** Co powtarzamy: sektor / fiszkę albo jeden kafelek osobno. */
export interface CelSesji {
  jednostkaId?: string
  /** Kafelek osobno (słaby albo nowy w nauczonym sektorze). */
  klucz?: string
  /** Kafelek osobno: jego sektor (dla nowych kafelków jeszcze bez pamięci). */
  sektorId?: string
}

interface Props {
  cel: CelSesji
  onZamknij: () => void
  onJumpToSource?: (ref: SourceRef) => void
}

/** Jedna rzecz do przypomnienia w sesji. */
interface Pozycja {
  klucz: string
  /** Węzeł ścieżki (jeśli kafelek stoi w ścieżce). */
  wezel?: PathNode
  conceptId?: string
  nazwa: string
  typ?: string
}

const NAPISY: Record<Przypomnienie, string> = { tak: 'Tak', czesciowo: 'Częściowo', nie: 'Nie' }

/** Ekran powtórki — wspólny dla testu powtórki zero, zwykłej powtórki,
 *  rozszerzonej (trudny tryb) i kafelka powtarzanego osobno.
 *
 *  Kolejność jest celowa: najpierw PISZESZ, potem odsłaniasz. Przywołanie
 *  w głowie i od razu czytanie odpowiedzi daje złudne „wiedziałem". Dlatego
 *  odsłonięcie jest od razu oceną, a podejrzenie przed przypomnieniem
 *  uczciwie liczy się jako „Nie". */
export function SesjaNauki({ cel, onZamknij, onJumpToSource }: Props) {
  const typy = useBlockTypes()
  const start = useRef(Date.now())
  const j = useLiveQuery(
    async () => (cel.jednostkaId ? await db.nauka.get(cel.jednostkaId) : undefined),
    [cel.jednostkaId],
  )
  const pamiecK = useLiveQuery(
    async () => (cel.klucz ? await db.pamiec.get(cel.klucz) : undefined),
    [cel.klucz],
  )
  const sektorK = useLiveQuery(
    async () => {
      const id = cel.sektorId ?? pamiecK?.jednostkaId
      return id ? await db.nauka.get(id) : undefined
    },
    [cel.sektorId, pamiecK?.jednostkaId],
  )
  const pathId = j?.pathId ?? pamiecK?.pathId ?? sektorK?.pathId
  const sciezka = useLiveQuery(
    async () => (pathId ? await db.paths.get(pathId) : undefined),
    [pathId],
  )
  const kafelki = useLiveQuery(() => db.concepts.toArray(), [])
  const wersje = useLiveQuery(() => db.versions.toArray(), []) ?? []
  const kafelek = useMemo(() => new Map((kafelki ?? []).map((c) => [c.id, c])), [kafelki])

  // ---- co jest w sesji ----
  const sektor = j?.rodzaj === 'sektor' ? j : undefined
  const fiszka = j?.rodzaj === 'fiszka' ? j : undefined
  /** Powtórka rozszerzona — czat albo trudny tryb (zakryte też nazwy).
   *  Liczona raz na otwarcie, żeby nie przeskoczyła w trakcie zapisu. */
  const [rozszerzona, setRozszerzona] = useState<'czat' | 'trudny' | null | undefined>(undefined)
  useEffect(() => {
    if (rozszerzona === undefined && j) setRozszerzona(czyRozszerzona(j) ? rodzajRozszerzonej(j) : null)
  }, [j, rozszerzona])
  const trudny = rozszerzona === 'trudny'
  /** Wynik czatu w powtórce rozszerzonej (albo pominięty dziś). */
  const [czat, setCzat] = useState<{ zaliczone: boolean; luki?: string } | undefined>()
  const [czatPominiety, setCzatPominiety] = useState(false)

  const wezly: PathNode[] = sektor ? wezlySektora(sektor, sciezka) : []
  const pozycje: Pozycja[] = useMemo(() => {
    if (sektor && sciezka) {
      return wezly.filter(ocenialny).map((n) => ({
        klucz: kluczWezla(n, sciezka.id)!,
        wezel: n,
        conceptId: n.kind === 'block' ? n.conceptId : undefined,
        nazwa:
          n.kind === 'block'
            ? (n.nazwa ?? kafelek.get(n.conceptId)?.name ?? '?')
            : n.kind === 'fusion'
              ? n.name || 'Grupa'
              : '',
        typ: n.kind === 'block' ? kafelek.get(n.conceptId)?.type : n.kind === 'fusion' ? n.type : undefined,
      }))
    }
    // fiszka albo kafelek osobno: szukamy go w ścieżce, żeby wyglądał jak tam
    const klucz = fiszka?.conceptId ?? cel.klucz
    if (!klucz) return []
    const nodeId = fiszka?.nodeId ?? pamiecK?.nodeId
    const wezel =
      sciezka?.nodes.find((n) => n.id === nodeId) ??
      sciezka?.nodes.find((n) => sciezka && kluczWezla(n, sciezka.id) === klucz)
    const conceptId = klucz.startsWith('grupa:') ? undefined : klucz
    const c = conceptId ? kafelek.get(conceptId) : undefined
    return [
      {
        klucz,
        wezel,
        conceptId,
        nazwa:
          fiszka?.nazwa ??
          (wezel?.kind === 'block' ? wezel.nazwa : undefined) ??
          (wezel?.kind === 'fusion' ? wezel.name : undefined) ??
          c?.name ??
          '?',
        typ: c?.type ?? (wezel?.kind === 'fusion' ? wezel.type : undefined),
      },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sektor?.id, sektor?.wezly.join(), sciezka, kafelek, fiszka?.id, cel.klucz, pamiecK?.nodeId])

  // ---- stan sesji ----
  const [odpowiedzi, setOdpowiedzi] = useState<Record<string, string>>({})
  const [oceny, setOceny] = useState<Record<string, Przypomnienie>>({})
  const [podejrzane, setPodejrzane] = useState<Set<string>>(new Set())
  const [odkryte, setOdkryte] = useState<Set<string>>(new Set())
  const [struktura, setStruktura] = useState<Przypomnienie | undefined>()
  const [mapaOdkryta, setMapaOdkryta] = useState(false)
  const [wybor, setWybor] = useState<Ocena | null>(null)
  const [wynik, setWynik] = useState<(PoSesji & { ocena: Ocena }) | null>(null)
  const [zapisuje, setZapisuje] = useState(false)

  const odslon = (klucz: string, podejrzyj: boolean) => {
    setOdkryte((s) => new Set(s).add(klucz))
    if (podejrzyj) {
      setPodejrzane((s) => new Set(s).add(klucz))
      setOceny((o) => ({ ...o, [klucz]: 'nie' }))
    }
  }

  const wszystkieOcenione = pozycje.length > 0 && pozycje.every((p) => oceny[p.klucz])
  const zStruktura = !!sektor
  const czekaNaCzat = rozszerzona === 'czat' && !czat && !czatPominiety
  const gotowe = wszystkieOcenione && (!zStruktura || !!struktura) && !czekaNaCzat
  const zZaznaczen: Ocena | null = gotowe
    ? cel.klucz || fiszka
      ? ({ tak: 3, czesciowo: 2, nie: 1 } as const)[oceny[pozycje[0].klucz]]
      : podpowiedz(
          pozycje.map((p) => oceny[p.klucz]),
          struktura,
        )
    : null
  // luki w czacie: to nie jest „Dobrze"
  const proponowana: Ocena | null =
    zZaznaczen && czat && !czat.zaliczone && zZaznaczen > 2 ? 2 : zZaznaczen
  const karta = j?.karta ?? pamiecK?.karta
  const dni = useMemo(() => podglad(karta), [karta])
  const zero = !!j && j.etap !== 'powtorki'
  const pierwszyTest = zero && !j?.karta

  const zapisz = async (ocena: Ocena) => {
    if (zapisuje) return
    setZapisuje(true)
    const wezlyKafelkow: Record<string, string> = {}
    for (const p of pozycje) if (p.wezel) wezlyKafelkow[p.klucz] = p.wezel.id
    const po = await zapiszSesje({
      jednostkaId: j?.id,
      klucz: cel.klucz,
      sektorId: cel.klucz ? (cel.sektorId ?? pamiecK?.jednostkaId) : undefined,
      ocena,
      kafelki: oceny,
      wezlyKafelkow,
      struktura,
      odpowiedzi,
      czasMs: Date.now() - start.current,
      trudny,
      rozszerzona: rozszerzona && !(rozszerzona === 'czat' && czatPominiety) ? rozszerzona : undefined,
      czat: rozszerzona === 'czat' ? czat : undefined,
      pathId,
    })
    setWynik({ ...po, ocena })
    setZapisuje(false)
  }

  if (cel.jednostkaId && j === undefined) return <section className="sesja" />
  if (cel.jednostkaId && !j) {
    return (
      <section className="sesja">
        <p className="hint">Tej rzeczy do nauki już nie ma.</p>
        <button className="btn" onClick={onZamknij}>
          ← Wróć
        </button>
      </section>
    )
  }

  const tytul = sektor
    ? sektor.nazwa
    : fiszka
      ? fiszka.nazwa
      : (pozycje[0]?.nazwa ?? 'Kafelek')
  const rodzajSesji = cel.klucz
    ? 'Kafelek osobno'
    : pierwszyTest
      ? 'Test po mapowaniu'
      : zero
        ? 'Test po poprawkach'
        : trudny
          ? 'Powtórka rozszerzona · trudny tryb'
          : rozszerzona === 'czat'
            ? 'Powtórka rozszerzona · test czatem'
            : 'Powtórka'

  // ---- po zapisie ----
  if (wynik) {
    return (
      <section className="sesja">
        <header className="sesja-glowa">
          <div>
            <span className="sesja-rodzaj">{rodzajSesji}</span>
            <h2>{tytul}</h2>
          </div>
        </header>
        <div className="sesja-wynik">
          {wynik.czat && j ? (
            j.etap === 'czat' ? (
              <>
                <p className="sesja-wynik-glowny">
                  Test zaliczony (<strong>{NAZWY_OCEN[wynik.ocena]}</strong>). Powtórka zero idzie dalej:{' '}
                  <strong>test czatem</strong>. Możesz go zrobić teraz albo później — czeka przy sektorze
                  w widoku Nauka.
                </p>
                <TestCzatem j={j} tryb="zero" />
              </>
            ) : (
              <p className="sesja-wynik-glowny">
                Powtórka zero skończona. Następna powtórka{' '}
                <strong>{opisDni(dniDo(wynik.termin!))}</strong> (
                {new Date(wynik.termin!).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}).
              </p>
            )
          ) : wynik.termin ? (
            <p className="sesja-wynik-glowny">
              Zapisano: <strong>{NAZWY_OCEN[wynik.ocena]}</strong>. Następna powtórka{' '}
              <strong>{opisDni(dniDo(wynik.termin))}</strong> (
              {new Date(wynik.termin).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}).
            </p>
          ) : wynik.doPoprawy ? (
            <p className="sesja-wynik-glowny">
              Wracasz do mapowania. Do poprawy: <strong>{wynik.doPoprawy.length}</strong>{' '}
              {wynik.doPoprawy.length === 1 ? 'miejsce' : 'miejsc'} — są zaznaczone w widoku Nauka.
              Potem znów przerwa i test.
            </p>
          ) : (
            <p className="sesja-wynik-glowny">Zapisano. Ta fiszka wróci jeszcze dziś.</p>
          )}
          {wynik.termin && wynik.doPoprawy && wynik.doPoprawy.length > 0 && (
            <p>
              Sektor wraca do mapowania tych miejsc, które nie szły ({wynik.doPoprawy.length}) — potem
              przerwa i test jeszcze raz.
            </p>
          )}
          {wynik.slabe > 0 && (
            <p>
              Słabe kafelki: <strong>{wynik.slabe}</strong> — wrócą osobno, wcześniej niż sektor, aż go
              dogonią.
            </p>
          )}
          {wynik.uparte.length > 0 && (
            <p className="sesja-uparte">
              <Icon name="uwaga" size={1} /> {wynik.uparte.length === 1 ? 'Jeden kafelek' : `${wynik.uparte.length} kafelki`}{' '}
              ciągle wypada. To zwykle znak, że jest źle sformułowany, a nie „trudny": przemapuj go —
              rozbij, dodaj przykład, dopisz do mapy.
            </p>
          )}
          <button className="btn btn-primary" onClick={onZamknij}>
            Gotowe
          </button>
        </div>
      </section>
    )
  }

  // ---- sesja ----
  const mapa = sektor?.mapa?.trim()
  const listaPytan = pytania()

  return (
    <section className="sesja">
      <header className="sesja-glowa">
        <div>
          <span className="sesja-rodzaj">{rodzajSesji}</span>
          <h2>{tytul}</h2>
          {sciezka && <span className="sesja-gdzie">{sciezka.name}</span>}
        </div>
        <button className="btn" onClick={onZamknij} title="Wyjdź bez zapisu">
          ← Wróć
        </button>
      </header>

      <div className="sesja-tresc">
        <p className="sesja-zasada">
          Najpierw napisz, co pamiętasz, potem odsłoń. <strong>Sprawdź</strong> — gdy już sobie
          przypomniałeś. <strong>Podejrzyj</strong> — gdy nie pamiętasz (liczy się jako „Nie").
        </p>

        {sektor && (
          <div className="sesja-blok sesja-mapa-pamiec">
            <h3>Sens i mapa — z pamięci</h3>
            <ul className="sesja-pytania">
              {listaPytan.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <textarea
              className="sesja-pole"
              rows={6}
              placeholder="Odtwórz mapę sektora i odpowiedz na pytania — tak, jak pamiętasz. Porównasz na końcu."
              value={odpowiedzi.mapa ?? ''}
              onChange={(e) => setOdpowiedzi((o) => ({ ...o, mapa: e.target.value }))}
            />
          </div>
        )}

        {sektor
          ? wezly.map((n) => {
              if (n.kind === 'heading') {
                return trudny ? null : (
                  <h3 key={n.id} className={`sesja-rozdzial poziom-${n.level}`}>
                    {n.text}
                  </h3>
                )
              }
              if (n.kind === 'text') {
                return <NotatkaZakryta key={n.id} tekst={n.text} />
              }
              const p = pozycje.find((x) => x.wezel?.id === n.id)
              if (!p) return null
              return (
                <ElementSesji
                  key={n.id}
                  p={p}
                  trudny={trudny}
                  odpowiedz={odpowiedzi[p.klucz] ?? ''}
                  onOdpowiedz={(t) => setOdpowiedzi((o) => ({ ...o, [p.klucz]: t }))}
                  odkryty={odkryte.has(p.klucz)}
                  podejrzany={podejrzane.has(p.klucz)}
                  ocena={oceny[p.klucz]}
                  onOdslon={(pod) => odslon(p.klucz, pod)}
                  onOcena={(o) => setOceny((x) => ({ ...x, [p.klucz]: o }))}
                  tresc={() => (
                    <TrescPozycji
                      p={p}
                      pathId={sciezka?.id}
                      kafelek={kafelek}
                      wersje={wersje}
                      onJumpToSource={onJumpToSource}
                    />
                  )}
                  typy={typy}
                />
              )
            })
          : pozycje.map((p) => (
              <ElementSesji
                key={p.klucz}
                p={p}
                trudny={false}
                odpowiedz={odpowiedzi[p.klucz] ?? ''}
                onOdpowiedz={(t) => setOdpowiedzi((o) => ({ ...o, [p.klucz]: t }))}
                odkryty={odkryte.has(p.klucz)}
                podejrzany={podejrzane.has(p.klucz)}
                ocena={oceny[p.klucz]}
                onOdslon={(pod) => odslon(p.klucz, pod)}
                onOcena={(o) => setOceny((x) => ({ ...x, [p.klucz]: o }))}
                widoczne={
                  fiszka && fiszka.zakryjStrone !== undefined && fiszka.zakryjStrone !== null && p.conceptId
                    ? () => (
                        <TrescPozycji
                          p={p}
                          pathId={sciezka?.id}
                          kafelek={kafelek}
                          wersje={wersje}
                          strona={null}
                          onJumpToSource={onJumpToSource}
                        />
                      )
                    : undefined
                }
                tresc={() => (
                  <TrescPozycji
                    p={p}
                    pathId={sciezka?.id}
                    kafelek={kafelek}
                    wersje={wersje}
                    strona={fiszka?.zakryjStrone}
                    onJumpToSource={onJumpToSource}
                  />
                )}
                typy={typy}
              />
            ))}

        {sektor && (
          <div className="sesja-blok sesja-mapa-porownaj">
            <h3>Porównaj z mapą</h3>
            {!mapaOdkryta ? (
              <button
                className="btn"
                disabled={!wszystkieOcenione}
                title={wszystkieOcenione ? '' : 'Najpierw sprawdź wszystkie kafelki'}
                onClick={() => setMapaOdkryta(true)}
              >
                <Icon name="odkryj" size={1} /> Odkryj mapę
              </button>
            ) : (
              <>
                {mapa ? (
                  <div className="markdown-body sesja-mapa" dangerouslySetInnerHTML={{ __html: renderMarkdown(mapa) }} />
                ) : (
                  <p className="hint">
                    Ten sektor nie ma jeszcze mapy — porównaj z kafelkami powyżej. Mapę dopiszesz
                    w widoku Nauka.
                  </p>
                )}
                {odpowiedzi.mapa && (
                  <details className="sesja-twoja">
                    <summary>Twoja odpowiedź</summary>
                    <p>{odpowiedzi.mapa}</p>
                  </details>
                )}
                <Zaznaczenie pytanie="Sens i struktura — pamiętałeś?" ocena={struktura} onOcena={setStruktura} />
              </>
            )}
          </div>
        )}

        {rozszerzona === 'czat' && j && (
          <div className="sesja-blok sesja-czat">
            <h3>Test czatem</h3>
            {czatPominiety ? (
              <p className="hint">
                Dziś bez czatu — następna powtórka znów będzie rozszerzona.{' '}
                <button className="btn btn-link" onClick={() => setCzatPominiety(false)}>
                  Jednak zrobię
                </button>
              </p>
            ) : (
              <>
                <p className="hint">
                  Ta powtórka jest rozszerzona: po zakrywaniu krótki test czatem. Czat jest egzaminatorem —
                  pyta po jednym, nie podpowiada, na końcu wypisuje luki.
                </p>
                <TestCzatem j={j} tryb="rozszerzona" wynik={czat} onWynik={(z, l) => setCzat({ zaliczone: z, luki: l })} />
                {!czat && (
                  <button className="btn btn-link" onClick={() => setCzatPominiety(true)}>
                    Pomiń czat dziś
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div className="sesja-blok sesja-ocena">
          <h3>Ocena</h3>
          {j && eksperyment() && Object.values(odpowiedzi).some((t) => t.trim()) && (
            <p className="sesja-eksperyment">
              <button
                className="btn"
                title="Eksperyment: czat porównuje to, co napisałeś z pamięci, z materiałem — i mówi, czego brakuje"
                onClick={async () => {
                  const tekst = [
                    odpowiedzi.mapa?.trim() ? `Mapa i sens:\n${odpowiedzi.mapa.trim()}` : '',
                    ...pozycje
                      .filter((p) => odpowiedzi[p.klucz]?.trim())
                      .map((p) => `${p.nazwa}:\n${odpowiedzi[p.klucz].trim()}`),
                  ]
                    .filter(Boolean)
                    .join('\n\n')
                  await otworzCzat(await zlozPolecenie(j, { rodzaj: 'sprawdz', odpowiedzi: tekst }))
                }}
              >
                Eksperyment: sprawdź czatem moje odpowiedzi
              </button>
            </p>
          )}
          {!gotowe ? (
            <p className="hint">
              {czekaNaCzat && wszystkieOcenione
                ? 'Zostało: wynik testu czatem (albo pomiń go dziś).'
                : sektor
                  ? 'Sprawdź wszystkie kafelki i porównaj mapę — wtedy podpowiem ocenę.'
                  : 'Sprawdź kafelek — wtedy podpowiem ocenę.'}
            </p>
          ) : (
            <>
              <div className="sesja-oceny">
                {([1, 2, 3, 4] as Ocena[]).map((o) => (
                  <button
                    key={o}
                    className={`btn sesja-ocena-btn ocena-${o} ${o === (wybor ?? proponowana) ? 'btn-active' : ''}`}
                    onClick={() => setWybor(o)}
                  >
                    <span className="sesja-ocena-nazwa">{NAZWY_OCEN[o]}</span>
                    <span className="sesja-ocena-dni">
                      {o === 1 && (pierwszyTest || sektor) && !fiszka
                        ? 'wróć do mapowania'
                        : o === 1 && fiszka && pierwszyTest
                          ? 'jeszcze dziś'
                          : opisDni(dni[o])}
                    </span>
                    {o === proponowana && <span className="sesja-ocena-podp">podpowiedź</span>}
                  </button>
                ))}
              </div>
              <button
                className="btn btn-primary sesja-zapisz"
                disabled={zapisuje}
                onClick={() => zapisz((wybor ?? proponowana)!)}
              >
                Zapisz: {NAZWY_OCEN[(wybor ?? proponowana)!]}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/** Notatka w sektorze — tło, nie porcja wiedzy: zakryta, ale bez oceny. */
function NotatkaZakryta({ tekst }: { tekst: string }) {
  const [widac, setWidac] = useState(false)
  return widac ? (
    <div className="sesja-notatka markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(tekst) }} />
  ) : (
    <button className="sesja-notatka-zakryta" onClick={() => setWidac(true)}>
      Notatka — kliknij, aby odkryć
    </button>
  )
}

function Zaznaczenie({
  pytanie,
  ocena,
  onOcena,
  zablokowane,
}: {
  pytanie: string
  ocena?: Przypomnienie
  onOcena: (o: Przypomnienie) => void
  zablokowane?: boolean
}) {
  return (
    <div className="sesja-zaznaczenie">
      <span>{pytanie}</span>
      {(['tak', 'czesciowo', 'nie'] as Przypomnienie[]).map((o) => (
        <button
          key={o}
          className={`btn zaznacz-${o} ${ocena === o ? 'btn-active' : ''}`}
          disabled={zablokowane && ocena !== o}
          onClick={() => onOcena(o)}
        >
          {NAPISY[o]}
        </button>
      ))}
    </div>
  )
}

function ElementSesji({
  p,
  trudny,
  odpowiedz,
  onOdpowiedz,
  odkryty,
  podejrzany,
  ocena,
  onOdslon,
  onOcena,
  tresc,
  widoczne,
  typy,
}: {
  p: Pozycja
  trudny: boolean
  odpowiedz: string
  onOdpowiedz: (t: string) => void
  odkryty: boolean
  podejrzany: boolean
  ocena?: Przypomnienie
  onOdslon: (podejrzyj: boolean) => void
  onOcena: (o: Przypomnienie) => void
  tresc: () => React.ReactNode
  /** Fiszka z zakrytą jedną stroną: to, co widać od początku. */
  widoczne?: () => React.ReactNode
  typy: ReturnType<typeof useBlockTypes>
}) {
  const def = p.typ ? typy.def(p.typ) : undefined
  return (
    <div className={`sesja-element ${odkryty ? 'odkryty' : ''}`} data-klucz={p.klucz}>
      {widoczne?.()}
      {/* po odsłonięciu nagłówek ma sam kafelek — drugi raz nazwy nie trzeba */}
      {!odkryty && (
      <div className="sesja-element-glowa">
        {def && (
          <span className="sesja-znak" style={{ color: def.color }}>
            {def.short}
          </span>
        )}
        <span className="sesja-nazwa">{trudny ? 'Co tu stoi?' : p.nazwa}</span>
      </div>
      )}
      {!odkryty ? (
        <>
          <textarea
            className="sesja-pole"
            rows={3}
            placeholder={trudny ? 'Co to za kafelek i co mówi?' : 'Napisz z pamięci (albo na kartce obok).'}
            value={odpowiedz}
            onChange={(e) => onOdpowiedz(e.target.value)}
          />
          <div className="sesja-przyciski">
            <button className="btn btn-primary" onClick={() => onOdslon(false)}>
              <Icon name="odkryj" size={1} /> Sprawdź
            </button>
            <button className="btn" onClick={() => onOdslon(true)} title={'Nie pamiętam — pokaż (liczy się jako „Nie")'}>
              Podejrzyj
            </button>
          </div>
        </>
      ) : (
        <>
          {odpowiedz && (
            <details className="sesja-twoja" open>
              <summary>Twoja odpowiedź</summary>
              <p>{odpowiedz}</p>
            </details>
          )}
          <div className="sesja-odkryta">{tresc()}</div>
          <Zaznaczenie
            pytanie={podejrzany ? 'Podejrzane — liczy się jako „Nie"' : 'Pamiętałeś?'}
            ocena={ocena}
            onOcena={onOcena}
            zablokowane={podejrzany}
          />
        </>
      )}
    </div>
  )
}

/** Treść kafelka tak, jak stoi w ścieżce (wersja, strona, tekst ścieżki),
 *  a bez ścieżki — tak, jak w bibliotece. */
function TrescPozycji({
  p,
  pathId,
  kafelek,
  wersje,
  strona,
  onJumpToSource,
}: {
  p: Pozycja
  pathId?: string
  kafelek: Map<string, Concept>
  wersje: BlockVersion[]
  /** Którą stronę pokazać: undefined = jak w ścieżce, null = główną. */
  strona?: string | null
  onJumpToSource?: (ref: SourceRef) => void
}) {
  const n = p.wezel
  const [sub, setSub] = useState<string | null | undefined>(strona)
  if (n?.kind === 'fusion') {
    return (
      <GroupShell
        name={n.name}
        type={n.type}
        parts={n.parts}
        content={n.content}
        strony={n.strony}
        zrodla={n.zrodla}
        onJumpToSource={onJumpToSource}
      />
    )
  }
  const c = p.conceptId ? kafelek.get(p.conceptId) : undefined
  if (!c) return <p className="hint">Tego kafelka już nie ma.</p>
  const wlasne = wersje.filter((v) => v.conceptId === c.id)
  const versionId = n?.kind === 'block' ? n.versionId : null
  const wersja = wlasne.find((v) => v.id === versionId) ?? wlasne.find((v) => v.id === c.currentVersionId)
  const subpageId = sub !== undefined ? sub : n?.kind === 'block' ? (n.subpageId ?? null) : null
  const trescWlasna =
    n?.kind === 'block' && wersja ? n.wlasneTresci?.[kluczWlasnej(wersja.id, subpageId)] : undefined
  return (
    <BlockShell
      concept={c}
      versions={wlasne}
      versionId={versionId}
      subpageId={subpageId}
      // fiszka z zakrytą stroną nie przełącza stron — inaczej zakryte dałoby się podejrzeć
      onSubpageChange={strona === undefined ? setSub : undefined}
      onJumpToSource={onJumpToSource}
      showOpen={false}
      nazwaWlasna={n?.kind === 'block' ? n.nazwa : undefined}
      trescWlasna={trescWlasna}
      bezPaskaWersji
      key={pathId}
    />
  )
}
