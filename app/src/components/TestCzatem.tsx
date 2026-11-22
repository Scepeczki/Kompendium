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
  ocenaPoCzacie,
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
  /** Próba: zamiast zapisu do bazy. */
  proba?: (zaliczone: boolean, luki: string | undefined, zCzatu: { kafelki: OcenaCzatu[]; klucz?: string }) => Promise<void>
  /** Próba: gotowe podsumowania do wklejenia jednym kliknięciem. */
  przyklady?: { nazwa: string; tekst: string }[]
  /** „Popraw mapy" przy lukach — otwiera tryb mapowania sektora. */
  onMapuj?: () => void
  /** Skutki poprzedniego zapisu (próba i ekran czatu trzymają je u siebie). */
  skutki?: PoCzacie | null
  /** Po zapisie (nie w próbie) — co się zmieniło. */
  onZapisano?: (po: PoCzacie) => void
  /** Po „Pomiń czat". */
  onPominieto?: () => void
}

const nazwaCzatu = () => CZATY.find((c) => c.id === czatWybrany())?.nazwa ?? new URL(adresCzatu()).host

export const NAPIS: Record<OcenaCzatu['ocena'], string> = {
  tak: 'Tak',
  czesciowo: 'Częściowo',
  nie: 'Nie',
  niesprawdzony: 'Niesprawdzony',
}
const NAPIS_P: Record<Przypomnienie, string> = { tak: 'Tak', czesciowo: 'Częściowo', nie: 'Nie' }
const KOLEJ = ['nie', 'czesciowo', 'niesprawdzony', 'tak']
const posortuj = (l: OcenaCzatu[]) =>
  l.map((k, i) => ({ k, i })).sort((a, b) => KOLEJ.indexOf(ocenaPoCzacie(a.k)) - KOLEJ.indexOf(ocenaPoCzacie(b.k)))

/** Kafelki ocenione przez czat — tylko do wglądu, najpierw słabsze. */
export function OcenyCzatu({ kafelki }: { kafelki: OcenaCzatu[] }) {
  if (!kafelki.length) return null
  return (
    <ul className="test-czatem-kafelki">
      {posortuj(kafelki).map(({ k, i }) => (
        <li key={i} className={`zaznacz-${ocenaPoCzacie(k)}`} data-kafelek={k.nazwa}>
          <span className="test-czatem-ocena">{NAPIS[ocenaPoCzacie(k)]}</span>
          <span className="test-czatem-kafelek">{k.nazwa}</span>
          {k.twoja && k.twoja !== k.ocena && <span className="hint">(twoja ocena; czat: {NAPIS[k.ocena]})</span>}
          {k.uwaga && <span className="test-czatem-uwaga">{k.uwaga}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Ocena czatu do zatwierdzenia. Klik w ocenę przy kafelku otwiera wybór:
 *  „Nie zgadzam się z oceną czatu — zmień na…" (Tak / Częściowo / Nie /
 *  Niesprawdzony). Twoja ocena zastępuje ocenę czatu. */
function OcenaDoZatwierdzenia({
  kafelki,
  onZmien,
}: {
  kafelki: OcenaCzatu[]
  onZmien: (i: number, twoja: OcenaCzatu['ocena'] | undefined) => void
}) {
  const [otwarte, setOtwarte] = useState<number | null>(null)
  useEffect(() => {
    if (otwarte === null) return
    const h = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.tc-wybor')) setOtwarte(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [otwarte])
  return (
    <ul className="tc-oceny">
      {posortuj(kafelki).map(({ k, i }) => {
        const o = ocenaPoCzacie(k)
        const zmieniona = !!k.twoja && k.twoja !== k.ocena
        return (
          <li key={i} className={`tc-ocena zaznacz-${o}`} data-kafelek={k.nazwa}>
            <div className="tc-ocena-glowa">
              <span className="tc-wybor">
                <button
                  className={`test-czatem-ocena tc-ocena-btn ${zmieniona ? 'tc-zmieniona' : ''}`}
                  title="Kliknij, żeby zmienić ocenę"
                  aria-haspopup="menu"
                  aria-expanded={otwarte === i}
                  onClick={() => setOtwarte(otwarte === i ? null : i)}
                >
                  {NAPIS[o]} <span aria-hidden>▾</span>
                </button>
                {otwarte === i && (
                  <div className="tc-menu" role="menu">
                    <div className="tc-menu-tytul">Nie zgadzam się z oceną czatu — zmień na:</div>
                    {(['tak', 'czesciowo', 'nie', 'niesprawdzony'] as OcenaCzatu['ocena'][]).map((x) => (
                      <button
                        key={x}
                        role="menuitem"
                        className={`tc-menu-poz zaznacz-${x} ${o === x ? 'wl' : ''}`}
                        onClick={() => {
                          onZmien(i, x === k.ocena ? undefined : x)
                          setOtwarte(null)
                        }}
                      >
                        <span className="tc-menu-kropka" />
                        {NAPIS[x]}
                        {x === k.ocena && <span className="hint"> — ocena czatu</span>}
                      </button>
                    ))}
                  </div>
                )}
              </span>
              <span className="test-czatem-kafelek">{k.nazwa}</span>
              {!k.klucz && <span className="hint">(nie pasuje do żadnego kafelka sektora — pominięty)</span>}
            </div>
            <div className="tc-ocena-opis">
              {zmieniona && (
                <span className="tc-zmiana">
                  Zmienione przez ciebie — czat dał: {NAPIS[k.ocena]}
                </span>
              )}
              {k.uwaga && <span className="test-czatem-uwaga">{k.uwaga}</span>}
              {!!k.luki?.length && (o === 'nie' || o === 'czesciowo') && (
                <ul className="test-czatem-luki-kafelka">
                  {k.luki.map((l, x) => (
                    <li key={x}>{l}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Klucz odpowiedzi czatu do jednego kafelka („- Nazwa: odpowiedź"). */
function kluczKafelka(klucz: string | undefined, nazwa: string): string | undefined {
  if (!klucz) return undefined
  const n = nazwa.toLowerCase()
  const linie = klucz.split('\n')
  for (let i = 0; i < linie.length; i++) {
    const m = /^\s*[-*•]\s*\**(.+?)\**\s*:\s*(.*)$/.exec(linie[i])
    if (!m || m[1].trim().toLowerCase() !== n) continue
    const reszta = [m[2]]
    for (let x = i + 1; x < linie.length && !/^\s*[-*•]\s/.test(linie[x]); x++) reszta.push(linie[x])
    return reszta.join('\n').trim()
  }
  return undefined
}

/** Po czacie z lukami: podsumowanie luk przy każdym kafelku i klucz odpowiedzi. */
function PodsumowanieLuk({ j }: { j: JednostkaNauki }) {
  const slabe = (j.czatKafelki ?? []).filter((k) => {
    const o = ocenaPoCzacie(k)
    return o === 'nie' || o === 'czesciowo'
  })
  return (
    <div className="tc-luki">
      <h4 className="tc-tytul">Luki do poprawy</h4>
      {slabe.length ? (
        <ul className="tc-luki-lista">
          {posortuj(slabe).map(({ k, i }) => {
            const wzor = kluczKafelka(j.kluczCzatu, k.nazwa)
            const o = ocenaPoCzacie(k)
            return (
              <li key={i} className={`tc-luka zaznacz-${o}`}>
                <div className="tc-ocena-glowa">
                  <span className="test-czatem-ocena">{NAPIS[o]}</span>
                  <span className="test-czatem-kafelek">{k.nazwa}</span>
                </div>
                <ul className="test-czatem-luki-kafelka">
                  {(k.luki?.length ? k.luki : k.uwaga ? [k.uwaga] : ['(czat nie opisał luki)']).map((l, x) => (
                    <li key={x}>{l}</li>
                  ))}
                </ul>
                {wzor && (
                  <details className="tc-wzor">
                    <summary>Wzorcowa odpowiedź od czatu</summary>
                    <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(wzor) }} />
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <pre className="test-czatem-zapisane">{j.luki}</pre>
      )}
      {j.kluczCzatu && !slabe.some((k) => kluczKafelka(j.kluczCzatu, k.nazwa)) && (
        <details className="tc-wzor">
          <summary>Klucz odpowiedzi od czatu</summary>
          <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(j.kluczCzatu) }} />
        </details>
      )}
    </div>
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
              ? `Są luki — popraw mapy i zrób dogrywkę${po.dogrywek ? ` (nieudane dogrywki: ${po.dogrywek} z ${po.limit})` : ''}.`
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
                <td className={`zaznacz-${k.twoja ?? k.czat}`}>
                  {k.twoja && k.twoja !== k.czat ? `${NAPIS[k.twoja]} (twoja; czat: ${NAPIS[k.czat]})` : NAPIS[k.czat]}
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
          Obniżone: {po.obnizone} {po.obnizone === 1 ? 'kafelek' : 'kafelki'} — terminy policzone jeszcze raz z oceną łączną.
        </span>
      )}
    </div>
  )
}

/** Test czatem: rozmowa z czatem w drugim oknie, potem wklejasz jego
 *  podsumowanie, zatwierdzasz ocenę (albo zmieniasz ją przy kafelku) i zapisujesz.
 *  Z lukami: podsumowanie luk, popraw mapy, dogrywka. */
export function TestCzatem({ j, tryb, onWynik, wynik, proba, przyklady, onMapuj, skutki, onZapisano, onPominieto }: Props) {
  const dogrywka = tryb === 'zero' && !!j.luki
  const bramka = tryb === 'zero' && j.etap === 'czat'
  const [tekst, setTekst] = useState<string | null>(null)
  const [wklejone, setWklejone] = useState('')
  const [kafelki, setKafelki] = useState<OcenaCzatu[]>([])
  const [zapisuje, setZapisuje] = useState(false)
  const [po, setPo] = useState<PoCzacie | null>(null)
  const odczytane = useMemo(() => (wklejone.trim() ? czytajWynik(wklejone) : null), [wklejone])
  const pokazSkutki = skutki ?? po

  // dopasowanie nazw z czatu do kafelków sektora (twoje zmiany znikają przy nowym wklejeniu)
  useEffect(() => {
    let zyje = true
    if (!odczytane) setKafelki([])
    else void dopasujKafelkiCzatu(j, odczytane.kafelki).then((k) => zyje && setKafelki(k))
    return () => {
      zyje = false
    }
  }, [odczytane, j])

  const zaliczone = odczytane ? czyZaliczone({ zaliczone: odczytane.zaliczone, kafelki }) : false
  const zostaje = kafelki.filter((k) => ['nie', 'czesciowo'].includes(ocenaPoCzacie(k))).length

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
    // luki kafelków, które uznałeś za „Tak" (albo niesprawdzone), nie idą dalej
    const zamkniete = kafelki
      .filter((k) => k.twoja === 'tak' || k.twoja === 'niesprawdzony')
      .map((k) => k.nazwa.toLowerCase())
    const luki =
      odczytane.luki
        .split('\n')
        .filter((l) => !zamkniete.some((n) => l.toLowerCase().includes(n)))
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
          onZapisano?.(r)
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

  let nr = 0
  return (
    <div className="test-czatem">
      {pokazSkutki && <SkutkiCzatu po={pokazSkutki} />}
      {dogrywka && (
        <>
          <PodsumowanieLuk j={j} />
          <h4 className="tc-tytul">Co dalej</h4>
          {bramka && (
            <p className="hint tc-bramka">
              Sektor pójdzie dalej dopiero po zaliczonej dogrywce
              {(j.dogrywek ?? 0) > 0 && (
                <span className="test-czatem-licznik">
                  {' '}
                  · nieudane dogrywki: {j.dogrywek} z {wez('limitDogrywek')}
                </span>
              )}
              .
            </p>
          )}
          {!bramka && <p className="hint tc-bramka">Dogrywka jest dobrowolna — powtórki idą normalnie.</p>}
          <div className="tc-krok">
            <span className="test-czatem-nr">{++nr}</span>
            <div className="tc-krok-tresc">
              <strong>Popraw mapy kafelków z lukami</strong>
              <span className="hint">Luki są już w wymaganiach tych kafelków („z czatu: …").</span>
              <div className="tc-przyciski">
                <button className="btn" disabled={!onMapuj} onClick={onMapuj} data-popraw-mapy>
                  Popraw mapy
                </button>
                {!onMapuj && proba && <span className="hint">(w próbie mapy się nie otwierają — nic by się nie zapisało)</span>}
              </div>
            </div>
          </div>
        </>
      )}
      <div className="tc-krok test-czatem-krok">
        <span className="test-czatem-nr">{++nr}</span>
        <div className="tc-krok-tresc">
          <strong>{dogrywka ? 'Dogrywka — czat zapyta tylko o luki' : 'Rozmowa z czatem'}</strong>
          <div className="tc-przyciski">
            <button className="btn btn-primary" onClick={async () => void otworzCzat(await zloz())}>
              {dogrywka ? 'Dogrywka' : 'Test czatem'}: kopiuj i otwórz {nazwaCzatu()}
            </button>
            <button className="btn" onClick={async () => void kopiujPolecenie(await zloz())}>
              Tylko kopiuj
            </button>
          </div>
          {tekst !== null && (
            <details className="test-czatem-polecenie">
              <summary>Pokaż polecenie</summary>
              <textarea readOnly value={tekst} rows={10} onFocus={(e) => e.target.select()} />
            </details>
          )}
        </div>
      </div>
      <div className="tc-krok test-czatem-wklej">
        <span className="test-czatem-nr">{++nr}</span>
        <div className="tc-krok-tresc test-czatem-wklej-pole">
          <strong>Wklej podsumowanie czatu</strong>
          {przyklady && przyklady.length > 0 && (
            <div className="test-czatem-przyklady">
              <span className="hint">Próba — gotowe podsumowanie:</span>
              {przyklady.map((p) => (
                <button key={p.nazwa} className="btn btn-maly" onClick={() => setWklejone(p.tekst)}>
                  {p.nazwa}
                </button>
              ))}
            </div>
          )}
          <textarea
            className="sesja-pole"
            rows={4}
            placeholder="Na końcu rozmowy czat poda podsumowanie w ramce (WYNIK, KAFELKI, LUKI, KLUCZ). Skopiuj je i wklej tutaj."
            value={wklejone}
            onChange={(e) => setWklejone(e.target.value)}
          />
        </div>
      </div>
      {odczytane && (
        <div className="test-czatem-odczyt">
          <h4 className="tc-tytul">Ocena czatu — zgadzasz się?</h4>
          {kafelki.length > 0 && <span className="hint">Kliknij ocenę przy kafelku, żeby ją zmienić.</span>}
          {kafelki.length > 0 ? (
            <OcenaDoZatwierdzenia
              kafelki={kafelki}
              onZmien={(i, twoja) => setKafelki((l) => l.map((k, x) => (x === i ? { ...k, twoja } : k)))}
            />
          ) : (
            <span className="hint">
              {odczytane.zaliczone === undefined
                ? 'Nie widzę podsumowania (WYNIK, KAFELKI) — zapiszę to jako luki.'
                : 'Bez ocen kafelków — liczy się sam WYNIK.'}
            </span>
          )}
          <div
            className={`test-czatem-werdykt ${zaliczone ? 'zaznacz-tak' : 'zaznacz-nie'}`}
            data-werdykt={zaliczone ? 'zaliczone' : 'luki'}
          >
            <span className="tc-werdykt-slowo">{zaliczone ? 'ZALICZONE' : 'NIEZALICZONE'}</span>
            <span className="tc-werdykt-co">
              {zaliczone
                ? bramka
                  ? `Sektor idzie dalej${zostaje ? `; kafelki na Częściowo (${zostaje}) będą słabe` : ''}.`
                  : `Zapisze się${zostaje ? `; kafelki na Częściowo (${zostaje}) będą słabe` : ''}.`
                : bramka
                  ? 'Zostają luki — po zapisie: podsumowanie luk, poprawa map i dogrywka.'
                  : 'Zostają luki — dogrywka będzie dobrowolna.'}
              {odczytane.zaliczone !== undefined && odczytane.zaliczone !== zaliczone && ' (liczą się oceny kafelków po twoich zmianach)'}
            </span>
          </div>
          <button className="btn btn-primary tc-zapisz" disabled={zapisuje} onClick={zapisz} data-zapisz-czat>
            Zapisz
          </button>
        </div>
      )}
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
              void pominCzat(j.id).then(() => onPominieto?.())
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
    [`${a}: wzorcowa odpowiedź z uzasadnieniem.`, `${c}: wzorcowa odpowiedź — oba pojęcia rozróżnione.`],
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
      {
        nazwa: 'Dogrywka nieudana',
        tekst: blok('NIEZALICZONE', [[c, 'NIE', 'nadal myli pojęcia.']], [`${c}: nadal myli pojęcia`], [`${c}: wzorcowa odpowiedź.`]),
      },
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
  przedCzatem,
  zakryte,
}: {
  j: JednostkaNauki
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
      {kopia.przemapowanie && (
        <>
          {po && <SkutkiCzatu po={po} />}
          <div className="tc-krok">
            <span className="test-czatem-nr">!</span>
            <div className="tc-krok-tresc">
              <strong>Limit dogrywek</strong>
              <span>
                W prawdziwej nauce teraz: mapowanie samych kafelków z NIE → przerwa → krótki test z nich
                (terminy się nie zmieniają) → znowu dogrywka.
              </span>
              <div className="tc-przyciski">
                <button className="btn btn-primary" onClick={() => setKopia({ ...kopia, przemapowanie: undefined, dogrywek: 0 })}>
                  Załóż, że krótki test przeszedł → dogrywka
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {dalej && (
        <TestCzatem
          key={`${runda}-${kopia.luki ? 'dogrywka' : 'test'}`}
          j={kopia}
          tryb="zero"
          proba={proba}
          skutki={po}
          przyklady={przykladyPodsumowan(nazwy, !!kopia.luki)}
        />
      )}
      {!dalej && !kopia.przemapowanie && (
        <>
          {po && <SkutkiCzatu po={po} />}
          <p className="settings-hint settings-status">
            W prawdziwej nauce sektor poszedłby dalej:{' '}
            {kopia.etap === 'zadania' || zadaniaWZero() ? 'zadania (opcjonalne) i test końcowy.' : 'powtórki.'}
          </p>
        </>
      )}
      <button
        className="btn btn-link"
        onClick={() => {
          setKopia(start)
          setPo(null)
          setRunda((x) => x + 1)
        }}
      >
        Jeszcze raz od testu czatem
      </button>
    </div>
  )
}
