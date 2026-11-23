import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, mainPageName } from '../db'
import { glownaWidoczna, stronaWidoczna } from '../widocznosc'
import { renderMarkdown } from '../markdown'
import { useBlockTypes } from '../blockTypes'
import { BlockShell } from './BlockShell'
import { GroupShell } from './GroupShell'
import { Icon } from './Icon'
import { CzatNaProbe, Etapy, KoniecCzatu, SkutkiCzatu, TestCzatem, przykladyPodsumowan, type CzatWSesji } from './TestCzatem'
import { useZadania } from './ZadaniaSektora'
import { wez } from '../naukaUstawienia'
import { TrybMapowania } from './TrybMapowania'
import { EtapZadan } from './EtapZadan'
import { eksperyment, otworzCzat, zlozPolecenie } from '../czat'
import {
  NAZWY_OCEN,
  czyRozszerzona,
  dniDo,
  kluczWezla,
  czyZadanie,
  idZadania,
  kluczZadania,
  laczna,
  ocenaPoCzacie,
  znaneKlucze,
  ocenialny,
  opisDni,
  podglad,
  podpowiedz,
  rodzajRozszerzonej,
  wezlySektora,
  zadaniaDoPowtorki,
  zapiszSesje,
  naProbe,
  znajdzTypZadania,
  minutyPrzemapowania,
  przemapowanieOtwarte,
  type Ocena,
  type PoCzacie,
  type PoSesji,
} from '../nauka'
import {
  kluczWlasnej,
  type BlockVersion,
  type Concept,
  type JednostkaNauki,
  type PathNode,
  type Przypomnienie,
  type RodzajRozszerzonej,
  type SourceRef,
} from '../types'

/** Co powtarzamy: sektor / fiszkę albo jeden kafelek osobno. */
export interface CelSesji {
  jednostkaId?: string
  /** „Doucz nowe": test tylko z nowych elementów nauczonego sektora. */
  douczanie?: boolean
  /** Krótki test po przemapowaniu kafelków z NIE (po limicie dogrywek). */
  przemapowanie?: boolean
  /** Kafelek osobno (słaby albo nowy w nauczonym sektorze). */
  klucz?: string
  /** Kafelek osobno: jego sektor (dla nowych kafelków jeszcze bez pamięci). */
  sektorId?: string
  /** Próba samego testu czatem na cały ekran (bez testu zakrytego przed nim —
   *  ten jest „na niby", z oceną `zakryteProby`). */
  probaCzatu?: boolean
  zakryteProby?: Przypomnienie
  /** Test czatem albo dogrywka na osobnym ekranie (etap czatu powtórki zero
   *  albo dobrowolna dogrywka po powtórce rozszerzonej). */
  czat?: boolean
  /** Etap zadań powtórki zero na osobnym ekranie (z `proba` — na niby). */
  zadania?: boolean
  /** Próba (Ustawienia → Próba): sektor z podmienionymi polami (np. etap),
   *  a zapis wyniku jest wycofywany — w bazie nic się nie zmienia. */
  proba?: Partial<JednostkaNauki>
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
  /** Zadanie: treść widać, rozwiązanie jest zakryte. */
  zadanie?: boolean
}

const NAPISY: Record<Przypomnienie, string> = { tak: 'Tak', czesciowo: 'Częściowo', nie: 'Nie' }

/** Po teście: ile Tak / Częściowo / Nie i jak poszedł każdy kafelek. */
function WynikKafelkow({
  pozycje,
  oceny,
  podejrzane,
  struktura,
}: {
  pozycje: Pozycja[]
  oceny: Record<string, Przypomnienie>
  podejrzane: Set<string>
  struktura?: Przypomnienie
}) {
  const ile = { tak: 0, czesciowo: 0, nie: 0 }
  for (const p of pozycje) if (oceny[p.klucz]) ile[oceny[p.klucz]]++
  const razem = ile.tak + ile.czesciowo + ile.nie
  if (!razem) return null
  const kolejnosc: Przypomnienie[] = ['nie', 'czesciowo', 'tak']
  const posortowane = [...pozycje].sort(
    (a, b) => kolejnosc.indexOf(oceny[a.klucz]) - kolejnosc.indexOf(oceny[b.klucz]),
  )
  return (
    <div className="sesja-wynik-kafelki">
      <div className="sesja-wynik-liczby">
        {(['tak', 'czesciowo', 'nie'] as Przypomnienie[]).map((o) => (
          <div key={o} className={`sesja-wynik-liczba zaznacz-${o}`}>
            <strong>{ile[o]}</strong>
            <span>{NAPISY[o]}</span>
          </div>
        ))}
        {struktura && (
          <div className={`sesja-wynik-liczba zaznacz-${struktura}`}>
            <strong>{NAPISY[struktura]}</strong>
            <span>mapa</span>
          </div>
        )}
      </div>
      <div className="sesja-wynik-pasek" aria-hidden>
        {(['tak', 'czesciowo', 'nie'] as Przypomnienie[]).map((o) =>
          ile[o] ? <span key={o} className={`zaznacz-${o}`} style={{ flex: ile[o] }} /> : null,
        )}
      </div>
      <ul className="sesja-wynik-lista">
        {posortowane.map((p) => {
          const o = oceny[p.klucz]
          if (!o) return null
          return (
            <li key={p.klucz} className={`zaznacz-${o}`}>
              <span className="sesja-wynik-kropka" />
              <span className="sesja-wynik-nazwa">{p.nazwa}</span>
              {podejrzane.has(p.klucz) && <span className="sesja-wynik-dopisek">podejrzane</span>}
              <span className="sesja-wynik-co">{NAPISY[o]}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

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
  const jBaza = useLiveQuery(
    async () => (cel.jednostkaId ? await db.nauka.get(cel.jednostkaId) : undefined),
    [cel.jednostkaId],
  )
  const j = useMemo(
    () => (jBaza && cel.proba ? ({ ...jBaza, ...cel.proba } as JednostkaNauki) : jBaza),
    [jBaza, cel.proba],
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
  /** Sektor, z którego są wymagania kafelków (też dla kafelka osobno). */
  const wymSektora = j?.rodzaj === 'sektor' ? j : sektorK
  const sektor = j?.rodzaj === 'sektor' ? j : undefined
  const fiszka = j?.rodzaj === 'fiszka' ? j : undefined
  /** Powtórka rozszerzona — czat, zadania albo trudny tryb (zakryte też nazwy).
   *  Liczona raz na otwarcie, żeby nie przeskoczyła w trakcie zapisu. */
  const [rozszerzona, setRozszerzona] = useState<RodzajRozszerzonej | null | undefined>(undefined)
  useEffect(() => {
    if (rozszerzona === undefined && j)
      setRozszerzona(!cel.douczanie && !cel.przemapowanie && czyRozszerzona(j) ? rodzajRozszerzonej(j) : null)
  }, [j, rozszerzona, cel.douczanie])
  const douczanie = !!cel.douczanie
  const przemapowanie = !!cel.przemapowanie
  /** Douczanie albo krótki test po przemapowaniu: w teście tylko te elementy. */
  const czesc = douczanie ? sektor?.douczanie : przemapowanie ? sektor?.przemapowanie : undefined
  const trudny = rozszerzona === 'trudny'
  /** Wynik czatu w powtórce rozszerzonej (albo pominięty dziś). */
  const [czat, setCzat] = useState<CzatWSesji | undefined>()
  const [czatPominiety, setCzatPominiety] = useState(false)

  /** Test końcowy powtórki zero — już z zadaniami. */
  const koncowy = sektor?.etap === 'zadania'
  const wszystkieZadania = useZadania(sektor)
  /** Zadania w tej sesji: w teście końcowym wszystkie, w powtórce
   *  rozszerzonej z zadaniami kilka (za każdym razem kolejne). */
  /** Nowe zadania (dołożone do nauczonego sektora, jeszcze nieuczone) —
   *  wchodzą też do zwykłej powtórki sektora. */
  const noweZadania =
    useLiveQuery(async () => {
      const ids = sektor?.etap === 'powtorki' ? (sektor.zadania ?? []) : []
      if (!ids.length) return new Set<string>()
      const [p, znane] = await Promise.all([db.pamiec.bulkGet(ids.map(kluczZadania)), znaneKlucze()])
      return new Set(ids.filter((id, i) => !p[i] && !znane.has(kluczZadania(id))))
    }, [sektor?.etap, (sektor?.zadania ?? []).join()]) ?? new Set<string>()
  const zadaniaSesji = useMemo(() => {
    const l = wszystkieZadania ?? []
    if (!sektor) return []
    if (czesc) return l.filter((c) => czesc.zadania.includes(c.id))
    if (koncowy) return l
    const nowe = l.filter((c) => noweZadania.has(c.id))
    if (rozszerzona !== 'zadanie') return nowe
    const wybrane = new Set([...zadaniaDoPowtorki(sektor, l.map((c) => c.id)), ...nowe.map((c) => c.id)])
    return l.filter((c) => wybrane.has(c.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wszystkieZadania, koncowy, rozszerzona, sektor?.id, sektor?.rozszerzonych, czesc, noweZadania])
  const wezly: PathNode[] = sektor ? wezlySektora(sektor, sciezka) : []
  /** Kafelek rodzaju „Zadanie" stojący w Linii sektora to też zadanie:
   *  w teście widać jego treść, a rozwiązanie jest zakryte. */
  const typZadania = znajdzTypZadania(typy.all)
  const zadanieWLinii = (n: PathNode) => n.kind === 'block' && kafelek.get(n.conceptId)?.type === typZadania
  const idsZadan = [
    ...zadaniaSesji.map((c) => c.id),
    ...(cel.klucz && czyZadanie(cel.klucz) ? [idZadania(cel.klucz)] : []),
    ...(cel.klucz && kafelek.get(cel.klucz)?.type === typZadania ? [cel.klucz] : []),
    // strony wszystkich kafelków: każdy może mieć stronę odsłoniętą w teście
    ...wezly.flatMap((n) => (n.kind === 'block' ? [n.conceptId] : [])),
    ...(cel.klucz && kafelek.has(cel.klucz) ? [cel.klucz] : []),
  ]
  const stronyKafelkow =
    useLiveQuery(() => db.subpages.where('conceptId').anyOf(idsZadan).toArray(), [idsZadan.join()]) ?? []
  const pozycje: Pozycja[] = useMemo(() => {
    if (sektor && sciezka) {
      const zad: Pozycja[] = zadaniaSesji.map((c) => ({
        klucz: kluczZadania(c.id),
        conceptId: c.id,
        nazwa: c.name,
        typ: c.type,
        zadanie: true,
      }))
      const tylkoNowe = czesc ? new Set(czesc.wezly) : null
      return [...wezly.filter(ocenialny).filter((n) => !tylkoNowe || tylkoNowe.has(n.id)).map((n) => ({
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
        zadanie: zadanieWLinii(n) || undefined,
      })), ...zad]
    }
    // fiszka albo kafelek osobno: szukamy go w ścieżce, żeby wyglądał jak tam
    const klucz = fiszka?.conceptId ?? cel.klucz
    if (!klucz) return []
    const nodeId = fiszka?.nodeId ?? pamiecK?.nodeId
    const wezel =
      sciezka?.nodes.find((n) => n.id === nodeId) ??
      sciezka?.nodes.find((n) => sciezka && kluczWezla(n, sciezka.id) === klucz)
    const conceptId = klucz.startsWith('grupa:') ? undefined : czyZadanie(klucz) ? idZadania(klucz) : klucz
    const c = conceptId ? kafelek.get(conceptId) : undefined
    return [
      {
        klucz,
        wezel,
        conceptId,
        zadanie: czyZadanie(klucz) || c?.type === typZadania || undefined,
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
  }, [sektor?.id, sektor?.wezly.join(), sciezka, kafelek, fiszka?.id, cel.klucz, pamiecK?.nodeId, zadaniaSesji, typZadania, czesc])

  // ---- stan sesji ----
  const [odpowiedzi, setOdpowiedzi] = useState<Record<string, string>>({})
  const [oceny, setOceny] = useState<Record<string, Przypomnienie>>({})
  const [podejrzane, setPodejrzane] = useState<Set<string>>(new Set())
  const [odkryte, setOdkryte] = useState<Set<string>>(new Set())
  const [struktura, setStruktura] = useState<Przypomnienie | undefined>()
  const [mapaOdkryta, setMapaOdkryta] = useState(false)
  const [wybor, setWybor] = useState<Ocena | null>(null)
  const [wynik, setWynik] = useState<(PoSesji & { ocena: Ocena }) | null>(null)
  /** Próba: sektor w stanie, w jakim byłby po zapisie (zapis jest wycofany). */
  const [jPoProbie, setJPoProbie] = useState<JednostkaNauki | undefined>()
  const [zapisuje, setZapisuje] = useState(false)
  /** „Popraw mapy" z ekranu wyniku — tryb mapowania nad sesją. */
  const [mapuje, setMapuje] = useState(false)
  /** Ekran czatu: co zmienił ostatni zapis. */
  const [poCzacie, setPoCzacie] = useState<PoCzacie | null>(null)
  /** Próba: dane testu zakrytego — czat na próbę odtwarza je przed sobą. */
  const daneProby = useRef<Parameters<typeof zapiszSesje>[0] | null>(null)

  const odslon = (klucz: string, podejrzyj: boolean) => {
    setOdkryte((s) => new Set(s).add(klucz))
    if (podejrzyj) {
      setPodejrzane((s) => new Set(s).add(klucz))
      setOceny((o) => ({ ...o, [klucz]: 'nie' }))
    }
  }

  const wszystkieOcenione = pozycje.length > 0 && pozycje.every((p) => oceny[p.klucz])
  // porównanie z mapą tylko wtedy, gdy sektor ma mapę
  const zStruktura = !!sektor && !czesc && !!sektor.mapa?.trim()
  const czekaNaCzat = rozszerzona === 'czat' && !czat && !czatPominiety
  const gotowe = wszystkieOcenione && (!zStruktura || !!struktura) && !czekaNaCzat
  /** Ocena łączna w powtórce rozszerzonej z czatem: gorsza z zakrytego
   *  i czatu (albo twojej oceny zamiast czatu; NIESPRAWDZONY nic nie zmienia). */
  const { ocenyRazem, slabeZCzatu } = useMemo(() => {
    const razem = { ...oceny }
    const slabe: string[] = []
    for (const k of czat?.kafelki ?? []) {
      const o = ocenaPoCzacie(k)
      if (!k.klucz || o === 'niesprawdzony') continue
      const p = pozycje.find((x) => x.wezel?.id === k.klucz || x.klucz === k.klucz)
      if (!p || !oceny[p.klucz]) continue
      razem[p.klucz] = laczna(oceny[p.klucz], o)
      if (razem[p.klucz] !== 'tak') slabe.push(p.klucz)
    }
    return { ocenyRazem: razem, slabeZCzatu: slabe }
  }, [oceny, czat, pozycje])
  const zZaznaczen: Ocena | null = gotowe
    ? cel.klucz || fiszka
      ? ({ tak: 3, czesciowo: 2, nie: 1 } as const)[ocenyRazem[pozycje[0].klucz]]
      : podpowiedz(
          pozycje.map((p) => ocenyRazem[p.klucz]),
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
    for (const p of pozycje) {
      if (p.wezel) wezlyKafelkow[p.klucz] = p.wezel.id
      // zadanie nie jest węzłem — do poprawy zaznacza się sam kafelek
      else if (p.zadanie && p.conceptId) wezlyKafelkow[p.klucz] = p.conceptId
    }
    const dane: Parameters<typeof zapiszSesje>[0] = {
      jednostkaId: j?.id,
      klucz: cel.klucz,
      sektorId: cel.klucz ? (cel.sektorId ?? pamiecK?.jednostkaId) : undefined,
      ocena,
      kafelki: ocenyRazem,
      wezlyKafelkow,
      struktura,
      odpowiedzi,
      czasMs: Date.now() - start.current,
      trudny,
      rozszerzona: rozszerzona && !(rozszerzona === 'czat' && czatPominiety) ? rozszerzona : undefined,
      czat: rozszerzona === 'czat' && czat ? { ...czat, zakryte: oceny } : undefined,
      slabeZCzatu: slabeZCzatu.length ? slabeZCzatu : undefined,
      pathId,
      douczanie: douczanie || undefined,
      przemapowanie: przemapowanie || undefined,
    }
    let po: PoSesji
    daneProby.current = dane
    if (cel.proba) {
      const r = await naProbe(async () => {
        // próba: sektor w stanie z próby, zapis i tak zostanie wycofany
        if (j) await db.nauka.put(j)
        const po = await zapiszSesje(dane)
        return { po, jPo: j ? await db.nauka.get(j.id) : undefined }
      })
      po = r.po
      setJPoProbie(r.jPo)
    } else po = await zapiszSesje(dane)
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
    : przemapowanie
      ? 'Krótki test po przemapowaniu'
    : douczanie
      ? 'Douczanie nowych'
      : koncowy
      ? 'Test końcowy'
      : pierwszyTest
      ? 'Test po mapowaniu'
      : zero
        ? 'Test po poprawkach'
        : trudny
          ? 'Powtórka rozszerzona · trudny tryb'
          : rozszerzona === 'czat'
            ? 'Powtórka rozszerzona · test czatem'
            : rozszerzona === 'zadanie' && zadaniaSesji.length
              ? 'Powtórka rozszerzona · zadania'
              : 'Powtórka'

  // ---- próba samego testu czatem: wygląd jak w prawdziwej nauce ----
  if (cel.probaCzatu && j) {
    return (
      <section className="sesja">
        <header className="sesja-glowa">
          <div>
            <span className="sesja-rodzaj">Test czatem</span>
            <span className="sesja-proba">Próba — nic się nie zapisuje</span>
            <h2>{tytul}</h2>
          </div>
          <button className="btn" onClick={onZamknij}>
            ← Wróć
          </button>
        </header>
        <div className="sesja-wynik sesja-czat-proba sesja-czat-ekran">
          <p className="hint">
            Przed czatem test zakryty „na niby": każdy kafelek{' '}
            <strong>{({ tak: 'Tak', czesciowo: 'Częściowo', nie: 'Nie' } as const)[cel.zakryteProby ?? 'tak']}</strong>. Rozmawiać z
            czatem nie musisz — kliknij gotowe podsumowanie.
          </p>
          <CzatNaProbe j={j} zakryte={() => cel.zakryteProby ?? 'tak'} />
        </div>
      </section>
    )
  }

  // ---- etap zadań na osobnym ekranie ----
  if (cel.zadania && j) {
    return (
      <section className="sesja">
        <header className="sesja-glowa">
          <div>
            <span className="sesja-rodzaj">Zadania</span>
            {cel.proba && <span className="sesja-proba">Próba — nic się nie zapisuje</span>}
            <h2>{tytul}</h2>
          </div>
          <button className="btn" onClick={onZamknij}>
            ← Wróć
          </button>
        </header>
        <div className="sesja-wynik sesja-czat-proba sesja-czat-ekran sesja-zadania-ekran">
          <EtapZadan
            j={j}
            proba={!!cel.proba}
            onTest={() => window.dispatchEvent(new CustomEvent('komp:sesja', { detail: { jednostkaId: j.id } }))}
            onGotowe={onZamknij}
          />
        </div>
      </section>
    )
  }

  // ---- test czatem / dogrywka na osobnym ekranie ----
  if (cel.czat && j) {
    const koniec = !!poCzacie && (poCzacie.zaliczone || j.etap !== 'czat') && !j.luki
    const rodzaj = j.przemapowanie
      ? 'Przemapowanie kafelków z NIE'
      : j.luki
        ? j.etap === 'czat'
          ? 'Dogrywka'
          : 'Dogrywka (dobrowolna)'
        : 'Test czatem'
    return (
      <section className="sesja">
        <header className="sesja-glowa">
          <div>
            <span className="sesja-rodzaj">{rodzaj}</span>
            <h2>{tytul}</h2>
          </div>
          <button className="btn" onClick={onZamknij}>
            ← Wróć
          </button>
        </header>
        <div className="sesja-wynik sesja-czat-proba sesja-czat-ekran">
          {koniec ? (
            <KoniecCzatu po={poCzacie!}>
              {j.etap === 'zadania' ? (
                <button
                  className="btn btn-primary sesja-do-zadan"
                  onClick={() => window.dispatchEvent(new CustomEvent('komp:sesja', { detail: { jednostkaId: j.id, zadania: true } }))}
                >
                  Zadania sektora →
                </button>
              ) : (
                <button className="btn btn-primary" onClick={onZamknij}>
                  Gotowe
                </button>
              )}
            </KoniecCzatu>
          ) : j.przemapowanie ? (
            <>
              {poCzacie && <SkutkiCzatu po={poCzacie} />}
              <div className="tc-krok">
                <span className="test-czatem-nr">1</span>
                <div className="tc-krok-tresc">
                  <strong>Przemapuj kafelki z NIE</strong>
                  <span className="hint">
                    Potem przerwa i krótki test samych tych kafelków (terminy się nie zmieniają), a po nim
                    znowu dogrywka.
                  </span>
                  <div className="tc-przyciski">
                    {j.przemapowanie.etap === 'mapowanie' ? (
                      <button className="btn btn-primary" onClick={() => setMapuje(true)}>
                        Mapuj ({j.przemapowanie.wezly.length + j.przemapowanie.zadania.length})
                      </button>
                    ) : przemapowanieOtwarte(j) ? (
                      <button
                        className="btn btn-primary"
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent('komp:sesja', { detail: { jednostkaId: j.id, przemapowanie: true } }),
                          )
                        }
                      >
                        Krótki test
                      </button>
                    ) : (
                      <span>Przerwa — krótki test za {Math.max(0, Math.ceil(wez('przerwa') - minutyPrzemapowania(j)))} min.</span>
                    )}
                  </div>
                </div>
              </div>
              <button className="btn" onClick={onZamknij}>
                Gotowe
              </button>
            </>
          ) : (
            <TestCzatem
              j={j}
              tryb="zero"
              onMapuj={() => setMapuje(true)}
              skutki={poCzacie}
              onZapisano={setPoCzacie}
              onPominieto={onZamknij}
            />
          )}
        </div>
        {mapuje && <TrybMapowania j={j} onZamknij={() => setMapuje(false)} />}
      </section>
    )
  }

  // ---- po zapisie ----
  // w próbie: sektor taki, jaki byłby po zapisie (np. etap „czat")
  const jw = cel.proba ? (jPoProbie ?? j) : j
  if (wynik) {
    return (
      <section className="sesja">
        <header className="sesja-glowa">
          <div>
            <span className="sesja-rodzaj">{rodzajSesji}</span>
            {cel.proba && <span className="sesja-proba">Próba — nic się nie zapisuje</span>}
            <h2>{tytul}</h2>
          </div>
        </header>
        <div className="sesja-wynik">
          <div className={`sesja-wynik-ocena ocena-${wynik.ocena}`}>
            <span className="sesja-etykieta">Wynik</span>
            <strong>{NAZWY_OCEN[wynik.ocena]}</strong>
            {wynik.termin && (
              <span className="sesja-wynik-termin">
                następna powtórka {opisDni(dniDo(wynik.termin))} ·{' '}
                {new Date(wynik.termin).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
            )}
          </div>
          {wynik.przemapowanie ? (
            <p className="sesja-wynik-glowny">
              Krótki test zapisany — terminy się nie zmieniły. Kafelki na Tak mają już zamknięte luki
              z czatu. Teraz <strong>znowu dogrywka</strong> (przy sektorze w widoku Nauka); licznik
              dogrywek liczy od zera.
            </p>
          ) : wynik.douczanie ? (
            <p className="sesja-wynik-glowny">
              Nowe zapisane. Każdy ma własny termin i wraca osobno, aż dogoni sektor — termin
              samego sektora się nie zmienia.
            </p>
          ) : wynik.koncowy ? (
            wynik.termin ? (
              <p className="sesja-wynik-glowny">
                Test końcowy zaliczony — powtórka zero skończona. Następna powtórka{' '}
                <strong>{opisDni(dniDo(wynik.termin))}</strong> (
                {new Date(wynik.termin).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}).
              </p>
            ) : (
              <>
                <p className="sesja-wynik-glowny">
                  Do poprawy: <strong>{wynik.doPoprawy?.length ?? 0}</strong> — popraw je (mapy, rozwiązania
                  zadań) i zrób test zakryty jeszcze raz.
                </p>
                {!cel.proba && jw && <button
                className="btn btn-primary sesja-do-zadan"
                onClick={() => window.dispatchEvent(new CustomEvent('komp:sesja', { detail: { jednostkaId: jw.id, zadania: true } }))}
              >
                Przejdź do zadań
              </button>}
              </>
            )
          ) : wynik.zadania ? (
            <>
              <p className="sesja-wynik-glowny">
                Test zaliczony (<strong>{NAZWY_OCEN[wynik.ocena]}</strong>). Powtórka zero idzie dalej:{' '}
                <strong>zadania</strong>, potem test zakryty z zadaniami.
              </p>
              {!cel.proba && jw && <button
                className="btn btn-primary sesja-do-zadan"
                onClick={() => window.dispatchEvent(new CustomEvent('komp:sesja', { detail: { jednostkaId: jw.id, zadania: true } }))}
              >
                Przejdź do zadań
              </button>}
            </>
          ) : wynik.czat && jw ? (
            jw.etap === 'zadania' ? (
              <>
                <p className="sesja-wynik-glowny">
                  Test czatem zaliczony. Teraz <strong>zadania</strong> (możesz je pominąć), potem test zakryty
                  z zadaniami.
                </p>
                {!cel.proba && <button
                className="btn btn-primary sesja-do-zadan"
                onClick={() => window.dispatchEvent(new CustomEvent('komp:sesja', { detail: { jednostkaId: jw.id, zadania: true } }))}
              >
                Przejdź do zadań
              </button>}
              </>
            ) : jw.etap === 'czat' ? (
              <>
                <p className="sesja-wynik-glowny">
                  Test zaliczony (<strong>{NAZWY_OCEN[wynik.ocena]}</strong>). Powtórka zero idzie dalej:{' '}
                  <strong>test czatem</strong>. Możesz go zrobić teraz albo później — czeka przy sektorze
                  w widoku Nauka.
                </p>
                {cel.proba ? (
                  <CzatNaProbe
                    j={jw}
                    przedCzatem={async () => {
                      // ten sam test zakryty jeszcze raz — w tej samej, wycofywanej transakcji
                      if (j && daneProby.current) {
                        await db.nauka.put(j)
                        await zapiszSesje(daneProby.current)
                      }
                    }}
                  />
                ) : (
                  <TestCzatem j={jw} tryb="zero" onMapuj={() => setMapuje(true)} />
                )}
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
          {wynik.termin && !wynik.koncowy && wynik.doPoprawy && wynik.doPoprawy.length > 0 && (
            <p>
              Sektor wraca do mapowania tych miejsc, które nie szły ({wynik.doPoprawy.length}) — potem
              przerwa i test jeszcze raz.
            </p>
          )}
          <WynikKafelkow
            pozycje={pozycje}
            oceny={ocenyRazem}
            podejrzane={podejrzane}
            struktura={zStruktura ? struktura : undefined}
          />
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
        {mapuje && jw && <TrybMapowania j={jw} onZamknij={() => setMapuje(false)} />}
      </section>
    )
  }

  // ---- sesja ----
  const mapa = sektor?.mapa?.trim()

  /** Strony kafelka w teście: które widać od początku (odsłonięte okiem przy
   *  stronie), a które są zakryte. Zadanie ma domyślnie odsłonięte polecenie.
   *  Tekst pisany w ścieżce ma pierwszeństwo, jak wszędzie. */
  const stronyWTescie = (p: Pozycja) => {
    if (!p.conceptId || p.wezel?.kind === 'fusion') return null
    const c = kafelek.get(p.conceptId)
    if (!c) return null
    const n = p.wezel?.kind === 'block' ? p.wezel : undefined
    const v =
      wersje.find((x) => x.id === n?.versionId && x.conceptId === c.id) ??
      wersje.find((x) => x.id === c.currentVersionId)
    const wlasna = (sid: string | null) => (v ? n?.wlasneTresci?.[kluczWlasnej(v.id, sid)] : undefined)
    const subs = stronyKafelkow
      .filter((x) => x.conceptId === c.id && x.versionId === v?.id)
      .sort((x, y) => x.order - y.order)
    const wszystkie: StronaTestu[] = [
      { id: null, nazwa: mainPageName(c), tresc: wlasna(null) ?? v?.content ?? '', widoczna: glownaWidoczna(v, c.type, typZadania) },
      ...subs.map((x) => ({ id: x.id, nazwa: x.name, tresc: wlasna(x.id) ?? x.content ?? '', widoczna: stronaWidoczna(x) })),
    ]
    return { widoczne: wszystkie.filter((x) => x.widoczna), zakryte: wszystkie.filter((x) => !x.widoczna) }
  }
  /** Kafelek z odsłoniętymi stronami: one widoczne od początku, pole na
   *  odpowiedź, zakryte strony dopiero po „Sprawdź". Bez odsłoniętych stron —
   *  null, czyli zwykły kafelek zakryty w całości. W trudnym teście (bez nazw)
   *  podpowiedzi zostają tylko przy zadaniach. */
  const elementOdsloniety = (p: Pozycja, trudnyTest = false) => {
    const st = stronyWTescie(p)
    if (!st || !st.widoczne.length) return null
    if (trudnyTest && !p.zadanie) return null
    return (
      <ElementSesji
        key={p.klucz}
        p={p}
        trudny={false}
        zadanie
        opisZakrytych={
          p.zadanie && st.zakryte.every((x) => x.id !== null)
            ? 'Rozwiązanie zakryte'
            : `Zakryte: ${st.zakryte.map((x) => x.nazwa).join(', ') || '—'}`
        }
        wymagania={wymSektora?.wymagania?.[p.wezel?.id ?? p.klucz]}
        zCzatu={wymSektora?.lukiKafelkow?.[p.wezel?.id ?? p.klucz]}
        odpowiedz={odpowiedzi[p.klucz] ?? ''}
        onOdpowiedz={(t) => setOdpowiedzi((o) => ({ ...o, [p.klucz]: t }))}
        odkryty={odkryte.has(p.klucz)}
        podejrzany={podejrzane.has(p.klucz)}
        ocena={oceny[p.klucz]}
        onOdslon={(pod) => odslon(p.klucz, pod)}
        onOcena={(o) => setOceny((x) => ({ ...x, [p.klucz]: o }))}
        widoczne={() => <StronyTestu strony={st.widoczne} klasa="sesja-zadanie-tresc" />}
        tresc={() => <StronyTestu strony={st.zakryte} zadanie={!!p.zadanie} />}
        typy={typy}
      />
    )
  }
  /** Zadanie bez stron (np. jeszcze się wczytuje) — jak dawniej: zakryte w całości. */
  const elementZadania = (p: Pozycja) =>
    elementOdsloniety(p) ?? (
      <ElementSesji
        key={p.klucz}
        p={p}
        trudny={false}
        zadanie
        odpowiedz={odpowiedzi[p.klucz] ?? ''}
        onOdpowiedz={(t) => setOdpowiedzi((o) => ({ ...o, [p.klucz]: t }))}
        odkryty={odkryte.has(p.klucz)}
        podejrzany={podejrzane.has(p.klucz)}
        ocena={oceny[p.klucz]}
        onOdslon={(pod) => odslon(p.klucz, pod)}
        onOcena={(o) => setOceny((x) => ({ ...x, [p.klucz]: o }))}
        tresc={() => <StronyTestu strony={[]} zadanie />}
        typy={typy}
      />
    )

  const ocenione = pozycje.filter((p) => oceny[p.klucz]).length + (zStruktura && struktura ? 1 : 0)
  const wszystkich = pozycje.length + (zStruktura ? 1 : 0)
  const idzDo = (klucz: string) =>
    document
      .querySelector(klucz === 'mapa' ? '.sesja-mapa-pamiec' : `.sesja-element[data-klucz="${CSS.escape(klucz)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const IKONY: Record<Przypomnienie, string> = { tak: '✓', czesciowo: '◐', nie: '✕' }
  const zPowtorkiZero = !!sektor && (pierwszyTest || zero || koncowy) && !douczanie && !przemapowanie && !cel.klucz

  return (
    <section className="sesja tz">
      <header className="sesja-glowa">
        <div>
          <span className="sesja-rodzaj">{rodzajSesji}</span>
          {cel.proba && <span className="sesja-proba">Próba — nic się nie zapisuje</span>}
          <h2>{tytul}</h2>
          {sciezka && <span className="sesja-gdzie">{sciezka.name}</span>}
        </div>
        <button className="btn" onClick={onZamknij} title="Wyjdź bez zapisu">
          ← Wróć
        </button>
      </header>

      <div className="sesja-tresc">
       <div className="tz-uklad">
        <aside className="tz-lewa" aria-label="Kafelki testu">
          <span className="tcz-lbl">{fiszka ? 'Fiszka' : 'Kafelki'}</span>
          <div className="tz-postep" aria-label={`Ocenione ${ocenione} z ${wszystkich}`}>
            <div className="tz-postep-pasek">
              <div style={{ width: `${wszystkich ? (100 * ocenione) / wszystkich : 0}%` }} />
            </div>
            <span>
              {ocenione} z {wszystkich}
            </span>
          </div>
          <ol className="tz-lista">
            {zStruktura && (
              <li>
                <button className={`tz-poz ${struktura ? `ocena-${struktura}` : ''}`} onClick={() => idzDo('mapa')}>
                  <span className="tz-nr">∑</span>
                  <span className="tz-poz-nazwa">Mapa sektora</span>
                  {struktura && <span className={`tcz-r tcz-r-${struktura}`}>{IKONY[struktura]}</span>}
                </button>
              </li>
            )}
            {pozycje.map((p, i) => {
              const o = oceny[p.klucz]
              return (
                <li key={p.klucz}>
                  <button
                    className={`tz-poz ${o ? `ocena-${o}` : odkryte.has(p.klucz) ? 'odkryty' : ''}`}
                    onClick={() => idzDo(p.klucz)}
                  >
                    <span className="tz-nr">{i + 1}</span>
                    <span className="tz-poz-nazwa">
                      {trudny ? `Kafelek ${i + 1}` : p.nazwa}
                      {p.zadanie && <span className="tz-poz-zad"> · zadanie</span>}
                    </span>
                    {o && <span className={`tcz-r tcz-r-${o}`}>{IKONY[o]}</span>}
                  </button>
                </li>
              )
            })}
          </ol>
        </aside>
        <div className="tz-glowna">
        {zPowtorkiZero && (
          <div className="tcz">
            <Etapy teraz={koncowy ? 4 : 0} />
          </div>
        )}
        <div className="tz-tytul">
          <h1 className="tcz-h1">{koncowy ? 'Test zakryty z zadaniami' : douczanie ? 'Test nowych' : 'Test zakryty'}</h1>
          <p className="sesja-zasada">
            Najpierw napisz, co pamiętasz, potem odsłoń. <strong>Sprawdź</strong> — gdy już sobie
            przypomniałeś. <strong>Podejrzyj</strong> — gdy nie pamiętasz (liczy się jako „Nie").
          </p>
        </div>

        {zStruktura && (
          <div className="sesja-blok sesja-mapa-pamiec">
            <div className="sesja-karta-glowa">
              <span className="sesja-etykieta">Mapa sektora</span>
              <b>Sens i mapa — z pamięci</b>
            </div>
            <div className="sesja-dwie">
              <div className="sesja-lewa">
                {mapaOdkryta ? (
                  <div className="markdown-body sesja-mapa" dangerouslySetInnerHTML={{ __html: renderMarkdown(mapa ?? '') }} />
                ) : (
                  <div className="sesja-zakryte sesja-mapa-porownaj">
                    <span className="sesja-etykieta">Mapa zakryta</span>
                    <button className="btn btn-primary" onClick={() => setMapaOdkryta(true)}>
                      <Icon name="odkryj" size={1} /> Odkryj mapę
                    </button>
                  </div>
                )}
              </div>
              <div className="sesja-prawa">
                {!mapaOdkryta ? (
                  <textarea
                    className="sesja-pole"
                    rows={7}
                    placeholder="Odtwórz mapę sektora — sens, struktura, jak kafelki się łączą — tak, jak pamiętasz."
                    value={odpowiedzi.mapa ?? ''}
                    onChange={(e) => setOdpowiedzi((o) => ({ ...o, mapa: e.target.value }))}
                  />
                ) : (
                  <div className="sesja-twoja">
                    <span className="sesja-etykieta">Twoja odpowiedź</span>
                    <p>{odpowiedzi.mapa?.trim() ? odpowiedzi.mapa : <em>— nic nie napisałeś —</em>}</p>
                  </div>
                )}
              </div>
            </div>
            {mapaOdkryta && (
              <div className="sesja-mapa-porownaj">
                <Zaznaczenie pytanie="Sens i struktura — pamiętałeś?" ocena={struktura} onOcena={setStruktura} />
              </div>
            )}
          </div>
        )}

        {sektor
          ? wezly.map((n) => {
              if (n.kind === 'heading') {
                return trudny || douczanie ? null : (
                  <h3 key={n.id} className={`sesja-rozdzial poziom-${n.level}`}>
                    {n.text}
                  </h3>
                )
              }
              if (n.kind === 'text') {
                return douczanie ? null : <NotatkaZakryta key={n.id} tekst={n.text} />
              }
              const p = pozycje.find((x) => x.wezel?.id === n.id)
              if (!p) return null
              if (p.zadanie) return elementZadania(p)
              const odsl = elementOdsloniety(p, trudny)
              if (odsl) return odsl
              return (
                <ElementSesji
                  key={n.id}
                  p={p}
                  trudny={trudny}
                  odpowiedz={odpowiedzi[p.klucz] ?? ''}
                  wymagania={wymSektora?.wymagania?.[n.id]}
                  zCzatu={wymSektora?.lukiKafelkow?.[n.id]}
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
          : pozycje.map((p) => p.zadanie ? elementZadania(p) : (!fiszka && elementOdsloniety(p)) || (
              <ElementSesji
                key={p.klucz}
                p={p}
                trudny={false}
                wymagania={p.wezel ? wymSektora?.wymagania?.[p.wezel.id] : undefined}
                zCzatu={p.wezel ? wymSektora?.lukiKafelkow?.[p.wezel.id] : undefined}
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

        {sektor && zadaniaSesji.length > 0 && (
          <div className="sesja-zadania">
            <h3 className="sesja-rozdzial poziom-1">Zadania</h3>
            <p className="hint">
              Treść widać. Napisz, jak to rozwiązać: pomysł i kluczowe kroki — liczyć do końca nie trzeba.
            </p>
            {pozycje.filter((p) => p.zadanie && !p.wezel).map(elementZadania)}
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
                <TestCzatem
                  j={j}
                  tryb="rozszerzona"
                  wynik={czat}
                  onWynik={setCzat}
                  przyklady={cel.proba ? przykladyPodsumowan(pozycje.map((p) => p.nazwa), false) : undefined}
                />
                {czat && slabeZCzatu.length > 0 && (
                  <p className="hint">
                    Czat obniżył ocenę: {pozycje.filter((p) => slabeZCzatu.includes(p.klucz) && ocenyRazem[p.klucz] !== oceny[p.klucz]).map((p) => p.nazwa).join(', ') || '—'}.
                    Liczy się gorsza ocena; te kafelki będą słabe.
                  </p>
                )}
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
                : douczanie
                  ? 'Sprawdź wszystkie nowe — każdy dostanie własną ocenę.'
                  : sektor
                  ? zStruktura
                    ? 'Sprawdź wszystkie kafelki i porównaj mapę — wtedy podpowiem ocenę.'
                    : 'Sprawdź wszystkie kafelki — wtedy podpowiem ocenę.'
                  : 'Sprawdź kafelek — wtedy podpowiem ocenę.'}
            </p>
          ) : przemapowanie ? (
            <button className="btn btn-primary sesja-zapisz" disabled={zapisuje} onClick={() => zapisz(3)}>
              Zapisz — terminy bez zmian, potem dogrywka
            </button>
          ) : douczanie ? (
            <button className="btn btn-primary sesja-zapisz" disabled={zapisuje} onClick={() => zapisz(3)}>
              Zapisz — każdy nowy ma własną ocenę
            </button>
          ) : koncowy ? (
            <>
              <div className="sesja-oceny sesja-oceny-koncowy">
                {([3, 1] as Ocena[]).map((o) => {
                  const pod = proponowana === 1 ? 1 : 3
                  return (
                    <button
                      key={o}
                      className={`btn sesja-ocena-btn ocena-${o} ${o === (wybor ?? pod) ? 'btn-active' : ''}`}
                      onClick={() => setWybor(o)}
                    >
                      <span className="sesja-ocena-nazwa">{o === 3 ? 'Zaliczony' : 'Do poprawy'}</span>
                      <span className="sesja-ocena-dni">
                        {o === 3 ? 'koniec powtórki zero — termin bez zmian' : 'popraw i zrób test końcowy jeszcze raz'}
                      </span>
                      {o === pod && <span className="sesja-ocena-podp">podpowiedź</span>}
                    </button>
                  )
                })}
              </div>
              <button
                className="btn btn-primary sesja-zapisz"
                disabled={zapisuje}
                onClick={() => zapisz(wybor ?? (proponowana === 1 ? 1 : 3))}
              >
                Zapisz: {(wybor ?? (proponowana === 1 ? 1 : 3)) === 1 ? 'do poprawy' : 'zaliczony'}
              </button>
            </>
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
  zadanie,
  wymagania,
  zCzatu,
  opisZakrytych,
}: {
  p: Pozycja
  trudny: boolean
  /** Zadanie: najpierw nazwa i treść, pole na metodę, zakryte rozwiązanie. */
  zadanie?: boolean
  odpowiedz: string
  onOdpowiedz: (t: string) => void
  odkryty: boolean
  podejrzany: boolean
  ocena?: Przypomnienie
  onOdslon: (podejrzyj: boolean) => void
  onOcena: (o: Przypomnienie) => void
  tresc: () => React.ReactNode
  /** Wymagania z mapowania — pod nazwą, nad polem na odpowiedź. */
  wymagania?: string
  /** Luki z czatu dopisane do wymagań („z czatu: …"). */
  zCzatu?: string[]
  /** Fiszka z zakrytą jedną stroną: to, co widać od początku. */
  widoczne?: () => React.ReactNode
  /** Napis na zakrytej części, gdy część kafelka widać (np. „Zakryte: Dowód"). */
  opisZakrytych?: string
  typy: ReturnType<typeof useBlockTypes>
}) {
  const def = p.typ ? typy.def(p.typ) : undefined
  return (
    <div
      className={`sesja-element ${odkryty ? 'odkryty' : ''} ${zadanie ? 'sesja-element-zadanie' : ''}`}
      data-klucz={p.klucz}
      style={def ? ({ '--typ': def.color } as React.CSSProperties) : undefined}
    >
      {!zadanie && widoczne?.()}
      {/* nagłówek karty zostaje też po odsłonięciu — z nim znaczek oceny */}
      <div className="sesja-element-glowa">
        {def && (
          <span className="sesja-znak" style={{ color: def.color }}>
            {def.short}
          </span>
        )}
        <span className="sesja-nazwa">{trudny ? 'Co tu stoi?' : p.nazwa}</span>
        {ocena && <span className={`sesja-znaczek-oceny zaznacz-${ocena}`}>{NAPISY[ocena]}</span>}
      </div>
      {zadanie && widoczne?.()}
      {/* z lewej kafelek (najpierw zakryty), z prawej twoja odpowiedź —
          po odsłonięciu oba naraz na ekranie, łatwiej ocenić */}
      <div className="sesja-dwie">
        <div className="sesja-lewa">
          {odkryty ? (
            <div className="sesja-odkryta">{tresc()}</div>
          ) : (
            <div className="sesja-zakryte">
              <span className="sesja-etykieta">{opisZakrytych ?? (zadanie ? 'Rozwiązanie zakryte' : 'Kafelek zakryty')}</span>
              <div className="sesja-przyciski">
                <button className="btn btn-primary" onClick={() => onOdslon(false)}>
                  <Icon name="odkryj" size={1} /> Sprawdź
                </button>
                <button className="btn" onClick={() => onOdslon(true)} title={'Nie pamiętam — pokaż (liczy się jako „Nie")'}>
                  Podejrzyj
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="sesja-prawa">
          {!trudny && (wymagania?.trim() || !!zCzatu?.length) && (
            <div className="sesja-wymagania">
              <span className="sesja-etykieta">Wymagania</span>
              {wymagania?.trim() && <span>{wymagania}</span>}
              {!!zCzatu?.length && (
                <ul className="sesja-wymagania-czat">
                  {zCzatu.map((l, i) => (
                    <li key={i}>
                      <span className="sesja-wymagania-zrodlo">z czatu:</span> {l}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {!odkryty ? (
            <textarea
              className="sesja-pole"
              rows={5}
              placeholder={
                p.zadanie
                  ? 'Jak to rozwiązać? Pomysł i kluczowe kroki — z pamięci.'
                  : trudny
                    ? 'Co to za kafelek i co mówi?'
                    : 'Napisz z pamięci (albo na kartce obok).'
              }
              value={odpowiedz}
              onChange={(e) => onOdpowiedz(e.target.value)}
            />
          ) : (
            <div className="sesja-twoja">
              <span className="sesja-etykieta">Twoja odpowiedź</span>
              <p>{odpowiedz.trim() ? odpowiedz : <em>— nic nie napisałeś —</em>}</p>
            </div>
          )}
        </div>
      </div>
      {odkryty && (
        <Zaznaczenie
          pytanie={podejrzany ? 'Podejrzane — liczy się jako „Nie"' : 'Pamiętałeś?'}
          ocena={ocena}
          onOcena={onOcena}
          zablokowane={podejrzany}
        />
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

/** Strona kafelka w teście zakrytym. */
interface StronaTestu {
  id: string | null
  nazwa: string
  tresc: string
  widoczna: boolean
}

/** Strony kafelka w teście — odsłonięte od początku albo zakryte, po
 *  „Sprawdź". Kilka stron: zakładki (w zadaniu najpierw rozwiązanie). */
function StronyTestu({ strony, zadanie, klasa }: { strony: StronaTestu[]; zadanie?: boolean; klasa?: string }) {
  const domyslna = (zadanie ? strony.find((s) => /rozwi/i.test(s.nazwa)) : undefined) ?? strony[0]
  const [wybrana, setWybrana] = useState<string | null | undefined>(domyslna?.id)
  const s = strony.find((x) => x.id === wybrana) ?? domyslna
  if (!s) {
    return (
      <p className="hint">
        {zadanie
          ? 'To zadanie nie ma jeszcze stron z rozwiązaniem i metodą — dopisz je w kafelku.'
          : 'Wszystkie strony tego kafelka są odsłonięte — nie ma czego sprawdzać.'}
      </p>
    )
  }
  return (
    <div className={klasa ?? 'sesja-rozwiazanie'}>
      {(strony.length > 1 || !klasa) && (
        <div className="block-pages">
          {strony.map((x) => (
            <button
              key={x.id ?? 'glowna'}
              className={`block-page ${x.id === s.id ? 'active' : ''}`}
              onClick={() => setWybrana(x.id)}
            >
              {x.nazwa}
            </button>
          ))}
        </div>
      )}
      <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(s.tresc || '_(pusto)_') }} />
    </div>
  )
}
