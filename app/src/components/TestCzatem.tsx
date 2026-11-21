import { useEffect, useMemo, useState } from 'react'
import { renderMarkdown } from '../markdown'
import {
  adresCzatu,
  czatWybrany,
  czytajWynik,
  czyZaliczone,
  CZATY,
  kopiujPolecenie,
  otworzCzat,
  zlozPolecenie,
} from '../czat'
import {
  dopasujKafelkiCzatu,
  naProbe,
  nazwyKafelkowSektora,
  pominCzat,
  symulujTestZakryty,
  wynikCzatu,
  type PoCzacie,
} from '../nauka'
import { db } from '../db'
import { wez, zadaniaWZero } from '../naukaUstawienia'
import type { JednostkaNauki, OcenaCzatu, Przypomnienie } from '../types'

/** Wynik czatu oddany do sesji (powtórka rozszerzona). */
export interface CzatWSesji {
  zaliczone: boolean
  luki?: string
  kafelki: OcenaCzatu[]
}

interface Props {
  j: JednostkaNauki
  /** `zero` — test czatem w powtórce zero (i dobrowolna dogrywka po powtórce
   *  rozszerzonej): wynik zapisuje się od razu. `rozszerzona` — w powtórce
   *  rozszerzonej: wynik idzie z całą sesją. */
  tryb: 'zero' | 'rozszerzona'
  /** Tylko w powtórce rozszerzonej: wynik oddany do sesji. */
  onWynik?: (w: CzatWSesji) => void
  wynik?: CzatWSesji
  /** Próba: zamiast zapisu do bazy. Zwraca, co by się stało. */
  proba?: (zaliczone: boolean, luki: string | undefined, zCzatu: { kafelki: OcenaCzatu[]; klucz?: string }) => Promise<void>
  /** Próba: gotowe podsumowania do wklejenia jednym kliknięciem. */
  przyklady?: { nazwa: string; tekst: string }[]
}

const nazwaCzatu = () => CZATY.find((c) => c.id === czatWybrany())?.nazwa ?? new URL(adresCzatu()).host

export const NAPIS: Record<OcenaCzatu['ocena'], string> = {
  tak: 'Tak',
  czesciowo: 'Częściowo',
  nie: 'Nie',
  niesprawdzony: 'Niesprawdzony',
}
const NAPIS_P: Record<Przypomnienie, string> = { tak: 'Tak', czesciowo: 'Częściowo', nie: 'Nie' }

/** Kafelki ocenione przez czat — kolorowe wiersze, najpierw słabsze.
 *  Z `onSprzeciw` przy Częściowo/Nie jest „Nie zgadzam się z oceną". */
export function OcenyCzatu({
  kafelki,
  onSprzeciw,
}: {
  kafelki: OcenaCzatu[]
  onSprzeciw?: (i: number, powod: string | undefined) => void
}) {
  const [pisze, setPisze] = useState<number | null>(null)
  const [powod, setPowod] = useState('')
  if (!kafelki.length) return null
  const kolej = ['nie', 'czesciowo', 'niesprawdzony', 'tak']
  return (
    <ul className="test-czatem-kafelki">
      {kafelki
        .map((k, i) => ({ k, i }))
        .sort((a, b) => kolej.indexOf(a.k.ocena) - kolej.indexOf(b.k.ocena))
        .map(({ k, i }) => (
          <li key={i} className={`zaznacz-${k.ocena}${k.sprzeciw ? ' test-czatem-uchylona' : ''}`} data-kafelek={k.nazwa}>
            <span className="test-czatem-ocena">{NAPIS[k.ocena]}</span>
            <span className="test-czatem-kafelek">
              {k.nazwa}
              {!k.klucz && onSprzeciw && <span className="hint"> (nie pasuje do żadnego kafelka sektora)</span>}
            </span>
            {k.uwaga && <span className="test-czatem-uwaga">{k.uwaga}</span>}
            {!!k.luki?.length && (
              <ul className="test-czatem-luki-kafelka">
                {k.luki.map((l, x) => (
                  <li key={x}>{l}</li>
                ))}
              </ul>
            )}
            {k.sprzeciw ? (
              <span className="test-czatem-sprzeciw">
                Nie zgadzasz się: „{k.sprzeciw}" — liczy się ocena z testu zakrytego.
                {onSprzeciw && (
                  <button className="btn btn-link" onClick={() => onSprzeciw(i, undefined)}>
                    Cofnij
                  </button>
                )}
              </span>
            ) : (
              onSprzeciw &&
              (k.ocena === 'nie' || k.ocena === 'czesciowo') &&
              (pisze === i ? (
                <span className="test-czatem-sprzeciw-pole">
                  <input
                    autoFocus
                    placeholder="Jedno zdanie: dlaczego ocena jest zła?"
                    value={powod}
                    onChange={(e) => setPowod(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && powod.trim()) {
                        onSprzeciw(i, powod.trim())
                        setPisze(null)
                        setPowod('')
                      }
                    }}
                  />
                  <button
                    className="btn btn-maly"
                    disabled={!powod.trim()}
                    onClick={() => {
                      onSprzeciw(i, powod.trim())
                      setPisze(null)
                      setPowod('')
                    }}
                  >
                    Uchyl ocenę
                  </button>
                  <button className="btn btn-link" onClick={() => setPisze(null)}>
                    Anuluj
                  </button>
                </span>
              ) : (
                <button
                  className="btn btn-link test-czatem-nie-zgadzam"
                  onClick={() => {
                    setPisze(i)
                    setPowod('')
                  }}
                >
                  Nie zgadzam się z oceną
                </button>
              ))
            )}
          </li>
        ))}
    </ul>
  )
}

/** Co zmienił zapis czatu: zakryty → czat → łącznie, i co dalej. */
export function SkutkiCzatu({ po }: { po: PoCzacie }) {
  const zLaczna = po.kafelki.filter((k) => k.zakryta)
  return (
    <div className="test-czatem-skutki" data-skutki={po.zaliczone ? 'zaliczone' : 'luki'}>
      <strong>
        {po.zaliczone
          ? po.etap === 'zadania'
            ? 'Zaliczone — sektor idzie dalej: zadania i test końcowy.'
            : po.etap === 'powtorki'
              ? po.dogrywka && !zLaczna.length
                ? 'Zaliczone — luki zamknięte.'
                : 'Zaliczone — sektor idzie do powtórek.'
              : 'Zaliczone.'
          : po.przemapowanie
            ? `Limit dogrywek (${po.limit}) — teraz przemapowanie samych kafelków z NIE: ${po.przemapowanie.join(', ')}. Potem przerwa, krótki test z nich i znowu dogrywka.`
            : po.etap === 'czat'
              ? `Są luki — sektor czeka na dogrywkę${po.dogrywek ? ` (nieudane dogrywki: ${po.dogrywek} z ${po.limit})` : ''}.`
              : 'Są luki — dogrywka jest dobrowolna, powtórki idą normalnie.'}
      </strong>
      {zLaczna.length > 0 && (
        <table className="test-czatem-tabela">
          <thead>
            <tr>
              <th>Kafelek</th>
              <th>Test zakryty</th>
              <th>Czat</th>
              <th>Łącznie</th>
            </tr>
          </thead>
          <tbody>
            {zLaczna.map((k, i) => (
              <tr key={i}>
                <td>{k.nazwa}</td>
                <td className={`zaznacz-${k.zakryta}`}>{NAPIS_P[k.zakryta!]}</td>
                <td className={`zaznacz-${k.czat}`}>
                  {NAPIS[k.czat]}
                  {k.sprzeciw && ' (uchylona)'}
                </td>
                <td className={`zaznacz-${k.lacznie}`}>
                  {NAPIS_P[k.lacznie!]}
                  {k.lacznie === 'nie' ? ' · słaby, do poprawy' : k.lacznie === 'czesciowo' ? ' · słaby' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {po.obnizone > 0 && (
        <span className="hint">
          Czat obniżył {po.obnizone} {po.obnizone === 1 ? 'kafelek' : 'kafelki'} — terminy policzone jeszcze raz z oceną łączną.
        </span>
      )}
    </div>
  )
}

/** Test czatem: skopiuj polecenie z materiałem, porozmawiaj z czatem
 *  w drugim oknie, wróć i wklej podsumowanie. Program sam odczyta wynik,
 *  ocenę kafelków, luki i klucz — ty możesz nie zgodzić się z oceną kafelka. */
export function TestCzatem({ j, tryb, onWynik, wynik, proba, przyklady }: Props) {
  const dogrywka = tryb === 'zero' && !!j.luki
  const bramka = tryb === 'zero' && j.etap === 'czat'
  const [tekst, setTekst] = useState<string | null>(null)
  const [wklejone, setWklejone] = useState('')
  const [kafelki, setKafelki] = useState<OcenaCzatu[]>([])
  const [zapisuje, setZapisuje] = useState(false)
  const [po, setPo] = useState<PoCzacie | null>(null)
  const odczytane = useMemo(() => (wklejone.trim() ? czytajWynik(wklejone) : null), [wklejone])

  // dopasowanie nazw z czatu do kafelków sektora (sprzeciwy znikają przy nowym wklejeniu)
  useEffect(() => {
    let zyje = true
    if (!odczytane) setKafelki([])
    else void dopasujKafelkiCzatu(j, odczytane.kafelki).then((k) => zyje && setKafelki(k))
    return () => {
      zyje = false
    }
  }, [odczytane, j])

  const zaliczone = odczytane ? czyZaliczone({ zaliczone: odczytane.zaliczone, kafelki }) : false

  const zloz = async () => {
    const t = await zlozPolecenie(j, {
      rodzaj: dogrywka ? 'dogrywka' : 'test',
      krotki: tryb === 'rozszerzona',
      technika: j.rozszerzonych ?? 0,
      luki: j.luki,
    })
    setTekst(t)
    return t
  }

  const zapisz = async () => {
    if (!odczytane || zapisuje) return
    setZapisuje(true)
    // luki uchylonych kafelków nie idą dalej
    const uchylone = kafelki.filter((k) => k.sprzeciw).map((k) => k.nazwa.toLowerCase())
    const luki =
      odczytane.luki
        .split('\n')
        .filter((l) => !uchylone.some((n) => l.toLowerCase().includes(n)))
        .join('\n')
        .trim() || undefined
    const listaLuk = zaliczone ? undefined : luki
    try {
      if (tryb === 'rozszerzona') onWynik?.({ zaliczone, luki: listaLuk, kafelki })
      else if (proba) await proba(zaliczone, listaLuk, { kafelki, klucz: odczytane.klucz })
      else {
        const r = await wynikCzatu(j.id, zaliczone, listaLuk, { kafelki, klucz: odczytane.klucz })
        if (r) {
          setPo(r)
          window.dispatchEvent(
            new CustomEvent('komp:komunikat', {
              detail: r.zaliczone ? 'Wynik czatu zapisany — zaliczone' : 'Wynik czatu zapisany — są luki',
            }),
          )
        }
      }
      setWklejone('')
    } finally {
      setZapisuje(false)
    }
  }

  return (
    <div className="test-czatem">
      {dogrywka && (
        <div className="test-czatem-luki">
          <strong>Luki z czatu</strong> — popraw mapy tych kafelków, potem dogrywka (czat sprawdzi tylko
          je).
          {bramka
            ? ' Sektor pójdzie dalej dopiero po zaliczonej dogrywce.'
            : ' Dogrywka jest dobrowolna — powtórki idą normalnie.'}
          {bramka && (j.dogrywek ?? 0) > 0 && (
            <span className="test-czatem-licznik">
              {' '}
              Nieudane dogrywki: {j.dogrywek} z {wez('limitDogrywek')}.
            </span>
          )}
          <pre>{j.luki}</pre>
          {j.czatKafelki && <OcenyCzatu kafelki={j.czatKafelki} />}
          {j.kluczCzatu && (
            <details className="test-czatem-klucz">
              <summary>Klucz odpowiedzi od czatu</summary>
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(j.kluczCzatu) }} />
            </details>
          )}
        </div>
      )}
      <div className="test-czatem-krok">
        <span className="test-czatem-nr">1</span>
        <button className="btn btn-primary" onClick={async () => void otworzCzat(await zloz())}>
          {dogrywka ? 'Dogrywka' : 'Test czatem'}: kopiuj i otwórz {nazwaCzatu()}
        </button>
        <button className="btn" onClick={async () => void kopiujPolecenie(await zloz())}>
          Tylko kopiuj
        </button>
        {tekst !== null && (
          <details className="test-czatem-polecenie">
            <summary>Pokaż polecenie</summary>
            <textarea readOnly value={tekst} rows={10} onFocus={(e) => e.target.select()} />
          </details>
        )}
      </div>
      <div className="test-czatem-wklej">
        <span className="test-czatem-nr">2</span>
        <div className="test-czatem-wklej-pole">
          {przyklady && przyklady.length > 0 && (
            <div className="test-czatem-przyklady">
              <span className="hint">Próba — wklej gotowe podsumowanie:</span>
              {przyklady.map((p) => (
                <button key={p.nazwa} className="btn btn-maly" onClick={() => setWklejone(p.tekst)}>
                  {p.nazwa}
                </button>
              ))}
            </div>
          )}
          <textarea
            className="sesja-pole"
            rows={5}
            placeholder="Na końcu rozmowy czat poda podsumowanie w ramce (WYNIK, KAFELKI, LUKI, KLUCZ). Skopiuj je i wklej tutaj — resztę odczytam sam."
            value={wklejone}
            onChange={(e) => setWklejone(e.target.value)}
          />
        </div>
      </div>
      {odczytane && (
        <div className="test-czatem-odczyt">
          <div className={`test-czatem-werdykt ${zaliczone ? 'zaznacz-tak' : 'zaznacz-nie'}`} data-werdykt={zaliczone ? 'zaliczone' : 'luki'}>
            {zaliczone ? 'ZALICZONE' : 'NIEZALICZONE'}
            {odczytane.zaliczone !== undefined && odczytane.zaliczone !== zaliczone && (
              <span className="hint"> (czat napisał {odczytane.zaliczone ? 'ZALICZONE' : 'NIEZALICZONE'}, ale liczą się oceny kafelków i twoje sprzeciwy)</span>
            )}
          </div>
          {kafelki.length > 0 ? (
            <>
              <span className="sesja-etykieta">Czat ocenił kafelki</span>
              <OcenyCzatu
                kafelki={kafelki}
                onSprzeciw={(i, powod) =>
                  setKafelki((l) => l.map((k, x) => (x === i ? { ...k, sprzeciw: powod } : k)))
                }
              />
              {odczytane.klucz && <span className="hint">+ klucz odpowiedzi do słabszych kafelków</span>}
            </>
          ) : (
            <span className="hint">
              {odczytane.zaliczone === undefined
                ? 'Nie widzę podsumowania (WYNIK, KAFELKI) — zapiszę to jako luki.'
                : 'Bez ocen kafelków — liczy się sam WYNIK.'}
            </span>
          )}
          <button className="btn btn-primary" disabled={zapisuje} onClick={zapisz} data-zapisz-czat>
            {zaliczone
              ? bramka
                ? 'Zapisz — zaliczone, idę dalej'
                : 'Zapisz — zaliczone'
              : bramka
                ? 'Zapisz luki — potem dogrywka'
                : 'Zapisz luki'}
          </button>
        </div>
      )}
      {po && !proba && <SkutkiCzatu po={po} />}
      {tryb === 'rozszerzona' && wynik && (
        <p className="hint test-czatem-zapisane">
          Wynik czatu: {wynik.zaliczone ? 'zaliczone' : 'są luki'}
          {wynik.kafelki.length ? ` · ocenione kafelki: ${wynik.kafelki.length}` : ''}
        </p>
      )}
      {bramka && !dogrywka && !proba && (
        <button
          className="btn btn-link test-czatem-pomin"
          title="Np. bez internetu albo czat nie działa"
          onClick={() => {
            if (window.confirm('Pominąć czat? Zostanie to w historii, a najbliższa powtórka tego sektora będzie z czatem.'))
              void pominCzat(j.id)
          }}
        >
          Pomiń czat (najbliższa powtórka będzie z czatem)
        </button>
      )}
    </div>
  )
}

/** Gotowe podsumowania czatu do próby — z nazw kafelków sektora. */
export function przykladyPodsumowan(nazwy: string[], dogrywka: boolean): { nazwa: string; tekst: string }[] {
  if (!nazwy.length) return []
  const blok = (wynik: string, kaf: [string, string, string][], luki: string[], klucz: string[]) =>
    '```\nWYNIK: ' +
    wynik +
    '\nKAFELKI:\n' +
    kaf.map(([n, o, u]) => `- ${n}: ${o} — ${u}`).join('\n') +
    '\nLUKI:\n' +
    (luki.length ? luki.map((l) => `- ${l}`).join('\n') : '- brak') +
    '\nKLUCZ:\n' +
    (klucz.length ? klucz.map((l) => `- ${l}`).join('\n') : '- brak') +
    '\n```'
  const [a, b, c] = [nazwy[0], nazwy[1] ?? nazwy[0], nazwy[nazwy.length - 1]]
  const wszystkieTak = blok(
    'ZALICZONE',
    nazwy.map((n) => [n, 'TAK', 'dobrze.']),
    [],
    [],
  )
  const zCzesciowo = blok(
    'ZALICZONE',
    nazwy.map((n) => (n === a ? [n, 'CZĘŚCIOWO', 'bez przykładu.'] : [n, 'TAK', 'dobrze.'])),
    [`${a}: brak przykładu`],
    [`${a}: wzorcowa odpowiedź z przykładem.`],
  )
  const zNie = blok(
    'NIEZALICZONE',
    nazwy.map((n, i): [string, string, string] =>
      n === c && nazwy.length > 1
        ? [n, 'NIE', 'pomylone pojęcia.']
        : i === 1 && nazwy.length > 2
          ? [n, 'NIESPRAWDZONY', 'nie było pytania.']
          : n === a
            ? [n, 'CZĘŚCIOWO', 'bez uzasadnienia.']
            : [n, 'TAK', 'dobrze.'],
    ),
    [`${a}: brak uzasadnienia`, `${c}: pomylone pojęcia`],
    [`${a}: wzorcowa odpowiedź.`, `${c}: wzorcowa odpowiedź.`],
  )
  const out = [
    { nazwa: 'Wszystko TAK', tekst: wszystkieTak },
    { nazwa: 'Zaliczone, ale z CZĘŚCIOWO', tekst: zCzesciowo },
    { nazwa: 'Niezaliczone (NIE, CZĘŚCIOWO, NIESPRAWDZONY)', tekst: zNie },
    { nazwa: 'Same luki bez wzoru', tekst: `Nie umiesz rozróżnić pojęć w kafelku ${b}.` },
  ]
  if (dogrywka) {
    out.unshift(
      { nazwa: 'Dogrywka zaliczona', tekst: blok('ZALICZONE', [[c, 'TAK', 'już siedzi.']], [], []) },
      { nazwa: 'Dogrywka nieudana', tekst: blok('NIEZALICZONE', [[c, 'NIE', 'nadal myli pojęcia.']], [`${c}: nadal myli pojęcia`], [`${c}: wzorcowa odpowiedź.`]) },
    )
  }
  return out
}

/** Test czatem i dogrywka na próbę — prawdziwa logika (ocena łączna, luki
 *  w wymaganiach, bramka, limit dogrywek) w transakcji, którą na końcu
 *  wycofujemy. Przed czatem jest test zakryty: z sesji próbnej (`przedCzatem`)
 *  albo „na niby" z ocenami `zakryte` (domyślnie wszystko Tak). */
export function CzatNaProbe({
  j,
  onKoniec,
  przedCzatem,
  zakryte,
}: {
  j: JednostkaNauki
  onKoniec?: () => void
  przedCzatem?: () => Promise<void>
  zakryte?: (kluczCzatu: string) => Przypomnienie
}) {
  const start: JednostkaNauki = {
    ...j,
    etap: 'czat',
    luki: undefined,
    czatKafelki: undefined,
    kluczCzatu: undefined,
    lukiKafelkow: undefined,
    dogrywek: undefined,
    dogrywekRazem: undefined,
    przemapowanie: undefined,
    doPoprawy: undefined,
  }
  const [kopia, setKopia] = useState<JednostkaNauki>(start)
  const [po, setPo] = useState<PoCzacie | null>(null)
  const [runda, setRunda] = useState(0)
  const [nazwy, setNazwy] = useState<string[]>([])
  useEffect(() => {
    void nazwyKafelkowSektora(j).then((l) => setNazwy(l.map((x) => x.nazwa)))
  }, [j])

  const proba = async (zaliczone: boolean, luki: string | undefined, zCzatu: { kafelki: OcenaCzatu[]; klucz?: string }) => {
    const r = await naProbe(async () => {
      // test zakryty jeszcze raz (wycofany razem z resztą), potem stan czatu z poprzednich rund
      if (przedCzatem) await przedCzatem()
      else await symulujTestZakryty(j, zakryte)
      const s = await db.nauka.get(j.id)
      await db.nauka.put({
        ...(s ?? j),
        etap: kopia.etap,
        luki: kopia.luki,
        czatKafelki: kopia.czatKafelki,
        kluczCzatu: kopia.kluczCzatu,
        lukiKafelkow: kopia.lukiKafelkow,
        dogrywek: kopia.dogrywek,
        dogrywekRazem: kopia.dogrywekRazem,
        przemapowanie: kopia.przemapowanie,
        doPoprawy: kopia.doPoprawy,
      })
      const po = await wynikCzatu(j.id, zaliczone, luki, zCzatu)
      return { po, j: await db.nauka.get(j.id) }
    })
    setPo(r.po ?? null)
    if (r.j) setKopia(r.j)
    setRunda((x) => x + 1)
  }

  const dalej = kopia.etap === 'czat' && !kopia.przemapowanie
  return (
    <div className="czat-na-probe" data-runda={runda}>
      {po && <SkutkiCzatu po={po} />}
      {kopia.lukiKafelkow && (
        <div className="test-czatem-wymagania-proba">
          <span className="sesja-etykieta">Wymagania w następnym teście (z czatu)</span>
          <ul>
            {Object.entries(kopia.lukiKafelkow).map(([k, l]) => (
              <li key={k}>
                {l.map((x) => `z czatu: ${x}`).join('; ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {kopia.przemapowanie && (
        <div className="test-czatem-luki">
          W prawdziwej nauce teraz: mapowanie samych kafelków z NIE → przerwa → krótki test z nich (terminy
          się nie zmieniają) → znowu dogrywka.{' '}
          <button
            className="btn btn-maly"
            onClick={() => setKopia({ ...kopia, przemapowanie: undefined, dogrywek: 0 })}
          >
            Załóż, że krótki test przeszedł → dogrywka
          </button>
        </div>
      )}
      {dalej && (
        <TestCzatem
          key={`${runda}-${kopia.luki ? 'dogrywka' : 'test'}`}
          j={kopia}
          tryb="zero"
          proba={proba}
          przyklady={przykladyPodsumowan(nazwy, !!kopia.luki)}
        />
      )}
      {!dalej && !kopia.przemapowanie && (
        <p className="settings-hint settings-status">
          W prawdziwej nauce sektor poszedłby dalej:{' '}
          {kopia.etap === 'zadania' || zadaniaWZero() ? 'zadania (opcjonalne) i test końcowy.' : 'powtórki.'}
        </p>
      )}
      <button
        className="btn btn-link"
        onClick={() => {
          setKopia(start)
          setPo(null)
          setRunda((x) => x + 1)
          onKoniec?.()
        }}
      >
        Jeszcze raz od testu czatem
      </button>
    </div>
  )
}
