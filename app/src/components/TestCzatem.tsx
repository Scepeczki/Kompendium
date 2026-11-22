import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
const IKONA: Record<OcenaCzatu['ocena'], string> = { tak: '✓', czesciowo: '◐', nie: '✕', niesprawdzony: '?' }
const KOLEJ = ['nie', 'czesciowo', 'niesprawdzony', 'tak']
const posortuj = (l: OcenaCzatu[]) =>
  l.map((k, i) => ({ k, i })).sort((a, b) => KOLEJ.indexOf(ocenaPoCzacie(a.k)) - KOLEJ.indexOf(ocenaPoCzacie(b.k)))

/** Znaczek oceny: ✓ Tak, ◐ Częściowo, ✕ Nie, ? Niesprawdzony. */
function Ocena({ o, tekst }: { o: OcenaCzatu['ocena']; tekst?: string }) {
  return (
    <span className={`tcz-r tcz-r-${o}`}>
      <span aria-hidden>{IKONA[o]}</span> {tekst ?? NAPIS[o]}
    </span>
  )
}

/** „1 luka", „2 luki", „5 luk". */
function luk(n: number) {
  if (n === 1) return '1 luka'
  const d = n % 10
  const s = n % 100
  return `${n} ${d >= 2 && d <= 4 && (s < 12 || s > 14) ? 'luki' : 'luk'}`
}
const kafelkow = (n: number) => (n === 1 ? 'kafelka' : 'kafelków')

/** Pasek etapów powtórki zero nad testem czatem. */
function Etapy({ teraz }: { teraz: number }) {
  const etapy = ['Test zakryty', 'Czat', 'Wynik', 'Luki i dogrywka', ...(zadaniaWZero() ? ['Zadania'] : [])]
  return (
    <nav className="tcz-etapy" aria-label="Etapy powtórki zero">
      {etapy.map((e, i) => (
        <span key={e} className="tcz-etap-wrap">
          {i > 0 && <span className="tcz-etap-kreska" aria-hidden />}
          <span className={`tcz-etap ${i < teraz ? 'zrobiony' : i === teraz ? 'teraz' : ''}`} aria-current={i === teraz ? 'step' : undefined}>
            <span className="tcz-etap-nr">{i < teraz ? '✓' : i + 1}</span>
            {e}
          </span>
        </span>
      ))}
    </nav>
  )
}

/** Kafelki ocenione przez czat — tylko do wglądu, najpierw słabsze. */
export function OcenyCzatu({ kafelki }: { kafelki: OcenaCzatu[] }) {
  if (!kafelki.length) return null
  return (
    <ul className="tcz-podglad">
      {posortuj(kafelki).map(({ k, i }) => (
        <li key={i} className={`zaznacz-${ocenaPoCzacie(k)}`} data-kafelek={k.nazwa}>
          <span className="tcz-podglad-nazwa">{k.nazwa}</span>
          {k.uwaga && <span className="tcz-szary">{k.uwaga}</span>}
          {k.twoja && k.twoja !== k.ocena && <span className="tcz-szary">(twoja ocena; czat: {NAPIS[k.ocena]})</span>}
          <Ocena o={ocenaPoCzacie(k)} />
        </li>
      ))}
    </ul>
  )
}

/** Uwaga czatu mówi to samo, co jedna z luk kafelka — nie pokazujemy dwa razy. */
const bezKropki = (t: string) => t.trim().toLowerCase().replace(/[.\s]+$/, '')
const powtarzaLuke = (k: OcenaCzatu) =>
  !!k.uwaga &&
  !!k.luki?.length &&
  ['nie', 'czesciowo'].includes(ocenaPoCzacie(k)) &&
  k.luki.some((l) => bezKropki(l).includes(bezKropki(k.uwaga!)) || bezKropki(k.uwaga!).includes(bezKropki(l)))

/** Ocena czatu do zatwierdzenia. Na górze kafelki do sprawdzenia (nie-Tak
 *  albo ze zmienioną oceną), Tak zwinięte. Klik w ocenę otwiera wybór:
 *  „Nie zgadzam się z oceną czatu — zmień na…". Kafelek ze zmienioną oceną
 *  ma przerywaną ramkę i podpis. */
function OcenaDoZatwierdzenia({
  kafelki,
  onZmien,
}: {
  kafelki: OcenaCzatu[]
  onZmien: (i: number, twoja: OcenaCzatu['ocena'] | undefined) => void
}) {
  const [otwarte, setOtwarte] = useState<number | null>(null)
  const [pokazTak, setPokazTak] = useState(false)
  useEffect(() => {
    if (otwarte === null) return
    const h = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.tcz-wybor')) setOtwarte(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [otwarte])
  // kolejność wg oceny czatu — zmiana nie przestawia wierszy
  const lista = kafelki.map((k, i) => ({ k, i })).sort((a, b) => KOLEJ.indexOf(a.k.ocena) - KOLEJ.indexOf(b.k.ocena))
  const zmieniona = (k: OcenaCzatu) => !!k.twoja && k.twoja !== k.ocena
  const doSprawdzenia = lista.filter(({ k }) => k.ocena !== 'tak' || zmieniona(k))
  const naTak = lista.filter(({ k }) => k.ocena === 'tak' && !zmieniona(k))
  const rozwiniete = pokazTak || !doSprawdzenia.length

  const wiersz = ({ k, i }: { k: OcenaCzatu; i: number }) => {
    const o = ocenaPoCzacie(k)
    const zm = zmieniona(k)
    return (
      <li key={i} className={`tcz-wiersz zaznacz-${o} ${zm ? 'tcz-zmieniona' : ''}`} data-kafelek={k.nazwa}>
        {zm && <span className="tcz-zmiana">Nie zgadzasz się z oceną czatu · czat dał: {NAPIS[k.ocena]}</span>}
        <div className="tcz-wiersz-opis">
          <b className="tcz-wiersz-nazwa">{k.nazwa}</b>
          {k.uwaga && !powtarzaLuke(k) && <p className="tcz-szary">Czat: „{k.uwaga.replace(/\.$/, '')}"</p>}
          {!k.klucz && <p className="tcz-szary">Nie pasuje do żadnego kafelka sektora — pominięty.</p>}
          {!!k.luki?.length && (o === 'nie' || o === 'czesciowo') && (
            <ul className="tcz-luki-kafelka">
              {k.luki.map((l, x) => (
                <li key={x}>
                  <span className="tcz-luka-znak">luka</span> {l}
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="tcz-wybor">
          <button
            className={`tcz-ocena-btn tcz-r tcz-r-${o}`}
            title="Kliknij, żeby zmienić ocenę"
            aria-haspopup="menu"
            aria-expanded={otwarte === i}
            onClick={() => setOtwarte(otwarte === i ? null : i)}
          >
            <span aria-hidden>{IKONA[o]}</span> {NAPIS[o]} <span className="tcz-strzalka" aria-hidden>▾</span>
          </button>
          {otwarte === i && (
            <div className="tcz-menu" role="menu">
              <div className="tcz-menu-tytul">Nie zgadzam się z oceną czatu — zmień na:</div>
              {(['tak', 'czesciowo', 'nie', 'niesprawdzony'] as OcenaCzatu['ocena'][]).map((x) => (
                <button
                  key={x}
                  role="menuitem"
                  className={`tcz-menu-poz zaznacz-${x} ${o === x ? 'wl' : ''}`}
                  onClick={() => {
                    onZmien(i, x === k.ocena ? undefined : x)
                    setOtwarte(null)
                  }}
                >
                  <Ocena o={x} />
                  {x === k.ocena && <span className="tcz-szary">ocena czatu</span>}
                </button>
              ))}
            </div>
          )}
        </span>
      </li>
    )
  }

  return (
    <div className="tcz-karta tcz-oceny-karta">
      {doSprawdzenia.length > 0 && (
        <>
          <div className="tcz-karta-naglowek">Do sprawdzenia</div>
          <ul className="tcz-oceny">{doSprawdzenia.map(wiersz)}</ul>
        </>
      )}
      {naTak.length > 0 &&
        (rozwiniete ? (
          <>
            <div className="tcz-karta-naglowek">
              Na Tak
              {doSprawdzenia.length > 0 && (
                <button className="tcz-link" onClick={() => setPokazTak(false)}>
                  zwiń ▴
                </button>
              )}
            </div>
            <ul className="tcz-oceny">{naTak.map(wiersz)}</ul>
          </>
        ) : (
          <button className="tcz-tak-zwiniete" onClick={() => setPokazTak(true)} data-pokaz-tak>
            <Ocena o="tak" tekst={`${naTak.length} × Tak`} />
            <span className="tcz-tak-nazwy">
              {naTak
                .slice(0, 3)
                .map(({ k }) => k.nazwa)
                .join(', ')}
              {naTak.length > 3 ? ` +${naTak.length - 3}` : ''}
            </span>
            <span className="tcz-link">pokaż ▾</span>
          </button>
        ))}
    </div>
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

const slabeKafelki = (j: JednostkaNauki) =>
  (j.czatKafelki ?? []).filter((k) => {
    const o = ocenaPoCzacie(k)
    return o === 'nie' || o === 'czesciowo'
  })

/** Po czacie z lukami: karta przy każdym kafelku z luką i wzorcową odpowiedzią. */
function PodsumowanieLuk({ j }: { j: JednostkaNauki }) {
  const slabe = slabeKafelki(j)
  return (
    <div className="tcz-luki">
      {slabe.length ? (
        <ul className="tcz-luki-lista">
          {posortuj(slabe).map(({ k, i }) => {
            const wzor = kluczKafelka(j.kluczCzatu, k.nazwa)
            const o = ocenaPoCzacie(k)
            return (
              <li key={i} className={`tcz-karta tcz-luka zaznacz-${o}`}>
                <div className="tcz-luka-glowa">
                  <b>{k.nazwa}</b>
                  <Ocena o={o} />
                  {k.twoja && k.twoja !== k.ocena && <span className="tcz-szary">twoja ocena · czat: {NAPIS[k.ocena]}</span>}
                </div>
                <ul className="tcz-luki-kafelka">
                  {(k.luki?.length ? k.luki : k.uwaga ? [k.uwaga] : ['(czat nie opisał luki)']).map((l, x) => (
                    <li key={x}>
                      <span className="tcz-luka-znak">luka</span> {l}
                    </li>
                  ))}
                </ul>
                {wzor && (
                  <details className="tcz-wzor">
                    <summary>Wzorcowa odpowiedź czatu</summary>
                    <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(wzor) }} />
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <pre className="tcz-karta test-czatem-zapisane tcz-luki-tekst">{j.luki}</pre>
      )}
      {j.kluczCzatu && !slabe.some((k) => kluczKafelka(j.kluczCzatu, k.nazwa)) && (
        <details className="tcz-karta tcz-wzor tcz-wzor-osobno">
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
    <div className={`tcz-karta tcz-skutki ${po.zaliczone ? 'ok' : 'luki'}`} data-skutki={po.zaliczone ? 'zaliczone' : 'luki'}>
      <div className="tcz-skutki-glowa">
        <Ocena o={po.zaliczone ? 'tak' : 'nie'} tekst={po.zaliczone ? 'Zapisane' : 'Zapisane — są luki'} />
        <strong>
          {po.zaliczone
            ? po.etap === 'zadania'
              ? 'Zaliczone — sektor idzie dalej: zadania i test zakryty z zadaniami.'
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
      </div>
      {zLaczna.length > 0 && (
        <table className="tcz-tabela">
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
                <td>
                  <Ocena o={k.zakryta!} />
                </td>
                <td>
                  <Ocena o={k.twoja ?? k.czat} />
                  {k.twoja && k.twoja !== k.czat && <span className="tcz-szary"> twoja; czat: {NAPIS[k.czat]}</span>}
                </td>
                <td>
                  <Ocena o={k.lacznie!} />
                  <span className="tcz-szary">
                    {k.lacznie === 'nie' ? ' słaby, do poprawy' : k.lacznie === 'czesciowo' ? ' słaby' : ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {po.obnizone > 0 && (
        <span className="tcz-szary">
          Obniżone: {po.obnizone} {po.obnizone === 1 ? 'kafelek' : 'kafelki'} — terminy policzone jeszcze raz z oceną łączną.
        </span>
      )}
    </div>
  )
}

/** Koniec testu czatem: duża karta z wynikiem i następnym krokiem. */
export function KoniecCzatu({ po, children }: { po: PoCzacie; children?: ReactNode }) {
  const oceny = po.kafelki.map((k) => ({ nazwa: k.nazwa, o: (k.lacznie ?? k.twoja ?? k.czat) as OcenaCzatu['ocena'] }))
  const tak = oceny.filter((k) => k.o === 'tak').length
  return (
    <div className="test-czatem tcz">
      <section className="tcz-karta tcz-koniec">
        <div className="tcz-koniec-glowa">
          <span className={`tcz-koniec-ikona ${po.zaliczone ? '' : 'luki'}`} aria-hidden>
            {po.zaliczone ? '✓' : '!'}
          </span>
          <div>
            <h1 className="tcz-h1">{po.zaliczone ? 'Czat zaliczony' : 'Wynik czatu zapisany'}</h1>
            {oceny.length > 0 && (
              <p className="tcz-pod">
                {tak} z {oceny.length} {kafelkow(oceny.length)} na Tak{po.dogrywka ? ' — po dogrywce' : ''}.
              </p>
            )}
          </div>
        </div>
        {oceny.length > 0 && (
          <div className="tcz-chipy">
            {oceny.map((k, i) => (
              <Ocena key={i} o={k.o} tekst={k.nazwa} />
            ))}
          </div>
        )}
        <SkutkiCzatu po={po} />
        {children && (
          <div className="tcz-koniec-dalej">
            <span className="tcz-lbl">Następny krok</span>
            <div className="tcz-przyciski">{children}</div>
          </div>
        )}
      </section>
    </div>
  )
}

/** Test czatem: rozmowa z czatem w drugim oknie, potem wklejasz jego
 *  podsumowanie, zatwierdzasz ocenę (albo zmieniasz ją przy kafelku) i zapisujesz.
 *  Z lukami: karty luk, „Co dalej" (popraw mapy, dogrywka, wklej). */
export function TestCzatem({ j, tryb, onWynik, wynik, proba, przyklady, onMapuj, skutki, onZapisano, onPominieto }: Props) {
  const dogrywka = tryb === 'zero' && !!j.luki
  const bramka = tryb === 'zero' && j.etap === 'czat'
  const [tekst, setTekst] = useState<string | null>(null)
  const [wklejone, setWklejone] = useState('')
  const [kafelki, setKafelki] = useState<OcenaCzatu[]>([])
  const [zapisuje, setZapisuje] = useState(false)
  const [po, setPo] = useState<PoCzacie | null>(null)
  const [ile, setIle] = useState(0)
  const odczytane = useMemo(() => (wklejone.trim() ? czytajWynik(wklejone) : null), [wklejone])
  const pokazSkutki = skutki ?? po

  useEffect(() => {
    let zyje = true
    void nazwyKafelkowSektora(j).then((l) => zyje && setIle(l.length))
    return () => {
      zyje = false
    }
  }, [j])

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

  // ---- kawałki wspólne dla widoków ----
  const przyciskiCzatu = (
    <>
      <button className="btn btn-primary tcz-otworz" onClick={async () => void otworzCzat(await zloz())}>
        {dogrywka ? 'Dogrywka: kopiuj i otwórz' : 'Kopiuj polecenie i otwórz'} {nazwaCzatu()}
      </button>
      <button className="tcz-link" onClick={async () => void kopiujPolecenie(await zloz())}>
        Tylko kopiuj
      </button>
      {tekst !== null && (
        <details className="test-czatem-polecenie">
          <summary>Pokaż polecenie</summary>
          <textarea readOnly value={tekst} rows={10} onFocus={(e) => e.target.select()} />
        </details>
      )}
    </>
  )
  const poleWklej = (duze: boolean) => (
    <div className={`tcz-wklej ${duze ? 'duze' : ''}`}>
      <textarea
        className="tcz-pole-wklej"
        aria-label="Podsumowanie czatu"
        rows={duze ? 5 : 4}
        placeholder={
          duze
            ? 'Wklej tutaj — Ctrl+V\n\nNa końcu rozmowy czat poda podsumowanie w ramce (WYNIK, KAFELKI, LUKI, KLUCZ).'
            : 'Wklej podsumowanie dogrywki — Ctrl+V'
        }
        value={wklejone}
        onChange={(e) => setWklejone(e.target.value)}
      />
      {przyklady && przyklady.length > 0 && (
        <div className="test-czatem-przyklady">
          <span className="tcz-szary">Próba — wstaw gotowe podsumowanie:</span>
          {przyklady.map((p) => (
            <button key={p.nazwa} className="btn btn-maly" onClick={() => setWklejone(p.tekst)}>
              {p.nazwa}
            </button>
          ))}
        </div>
      )}
    </div>
  )
  const etapy = tryb === 'zero' && bramka && <Etapy teraz={odczytane ? 2 : dogrywka ? 3 : 1} />

  // ---- ocena czatu do zatwierdzenia ----
  if (odczytane) {
    const ile = (o: OcenaCzatu['ocena']) => kafelki.filter((k) => ocenaPoCzacie(k) === o).length
    return (
      <div className="test-czatem tcz tcz-widok-ocena">
        {etapy}
        <div className="tcz-glowa tcz-glowa-rzad">
          <div>
            <h1 className="tcz-h1">Ocena czatu{dogrywka ? ' — dogrywka' : ''}</h1>
            <p className="tcz-pod">
              {kafelki.length ? 'Zgadzasz się? Kliknij ocenę przy kafelku, żeby ją zmienić.' : 'Sprawdź, co odczytałem, i zapisz.'}
            </p>
          </div>
          {kafelki.length > 0 && (
            <div className="tcz-podsumowanie">
              {(['nie', 'czesciowo', 'niesprawdzony', 'tak'] as OcenaCzatu['ocena'][])
                .filter((o) => ile(o))
                .map((o) => (
                  <Ocena key={o} o={o} tekst={`${ile(o)} × ${NAPIS[o]}`} />
                ))}
            </div>
          )}
        </div>
        <div className="test-czatem-odczyt">
          {kafelki.length > 0 ? (
            <OcenaDoZatwierdzenia
              kafelki={kafelki}
              onZmien={(i, twoja) => setKafelki((l) => l.map((k, x) => (x === i ? { ...k, twoja } : k)))}
            />
          ) : (
            <p className="tcz-karta tcz-pusto">
              {odczytane.zaliczone === undefined
                ? 'Nie widzę podsumowania (WYNIK, KAFELKI) — zapiszę to jako luki.'
                : 'Bez ocen kafelków — liczy się sam WYNIK.'}
            </p>
          )}
          <details className="tcz-surowy">
            <summary>Pokaż wklejony tekst</summary>
            <pre>{wklejone}</pre>
          </details>
        </div>
        <div className="tcz-stopka">
          <div className="test-czatem-werdykt tcz-werdykt" data-werdykt={zaliczone ? 'zaliczone' : 'luki'}>
            <Ocena o={zaliczone ? 'tak' : 'nie'} tekst={zaliczone ? 'Zaliczone' : 'Niezaliczone'} />
            <span className="tcz-werdykt-co">
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
          <button className="tcz-link" onClick={() => setWklejone('')} data-wklej-ponownie>
            Wklej ponownie
          </button>
          <button className="btn btn-primary tcz-zapisz" disabled={zapisuje} onClick={zapisz} data-zapisz-czat>
            Zapisz wynik
          </button>
        </div>
      </div>
    )
  }

  // ---- luki i dogrywka ----
  if (dogrywka) {
    const slabe = slabeKafelki(j)
    return (
      <div className="test-czatem tcz tcz-widok-luki">
        {etapy}
        {pokazSkutki && <SkutkiCzatu po={pokazSkutki} />}
        <div className="tcz-uklad">
          <section className="tcz-glowna">
            <div className="tcz-glowa tcz-glowa-rzad tcz-glowa-luki">
              <h1 className="tcz-h1">{slabe.length ? `${luk(slabe.length)} do poprawy` : 'Luki do poprawy'}</h1>
              <Ocena o="nie" tekst={bramka ? 'Niezaliczone' : 'Dogrywka dobrowolna'} />
            </div>
            <PodsumowanieLuk j={j} />
            {(j.czatKafelki?.length ?? 0) > 0 && (
              <details className="tcz-karta tcz-wszystkie">
                <summary>
                  Wszystkie oceny czatu · {j.czatKafelki!.length} {kafelkow(j.czatKafelki!.length)}
                  <span className="tcz-szary"> — {j.czatKafelki!.length - slabe.length} bez luk, {slabe.length} z lukami</span>
                </summary>
                <OcenyCzatu kafelki={j.czatKafelki!} />
              </details>
            )}
          </section>
          <aside className="tcz-karta tcz-co-dalej" aria-label="Co dalej">
            <span className="tcz-lbl">Co dalej</span>
            <div className="tcz-krok">
              <span className="tcz-nr">1</span>
              <div className="tcz-krok-tresc">
                <b>Popraw mapy</b>
                <span className="tcz-szary">Luki są już w wymaganiach tych kafelków („z czatu: …").</span>
                <button className="btn" disabled={!onMapuj} onClick={onMapuj} data-popraw-mapy>
                  Popraw mapy
                </button>
                {!onMapuj && proba && <span className="tcz-szary">(w próbie mapy się nie otwierają)</span>}
              </div>
            </div>
            <div className="tcz-krok tcz-krok-czat">
              <span className="tcz-nr">2</span>
              <div className="tcz-krok-tresc">
                <b>Dogrywka z czatem</b>
                <span className="tcz-szary">Czat zapyta tylko o luki.</span>
                {przyciskiCzatu}
              </div>
            </div>
            <div className="tcz-krok">
              <span className="tcz-nr">3</span>
              <div className="tcz-krok-tresc">
                <b>Wklej wynik dogrywki</b>
                {poleWklej(false)}
              </div>
            </div>
            <p className="tcz-bramka">
              {bramka ? (
                <>
                  Sektor pójdzie dalej dopiero po zaliczonej dogrywce
                  {(j.dogrywek ?? 0) > 0 && (
                    <span className="test-czatem-licznik">
                      {' '}
                      · nieudane dogrywki: {j.dogrywek} z {wez('limitDogrywek')}
                    </span>
                  )}
                  .
                </>
              ) : (
                'Dogrywka jest dobrowolna — powtórki idą normalnie.'
              )}
            </p>
          </aside>
        </div>
      </div>
    )
  }

  // ---- start: trzy kroki i pole do wklejenia ----
  const skopiowane = tekst !== null
  return (
    <div className="test-czatem tcz tcz-widok-start">
      {etapy}
      {pokazSkutki && <SkutkiCzatu po={pokazSkutki} />}
      <div className="tcz-glowa">
        <h1 className="tcz-h1">Test czatem</h1>
        <p className="tcz-pod">
          {ile ? `Czat przepyta cię z ${ile} ${kafelkow(ile)}.` : 'Czat przepyta cię z kafelków sektora.'} Na końcu da
          podsumowanie do wklejenia.
        </p>
      </div>
      <div className="tcz-kroki">
        <div className={`tcz-karta tcz-krok tcz-krok-czat ${skopiowane ? 'zrobiony' : 'teraz'}`}>
          <div className="tcz-krok-glowa">
            <span className="tcz-nr">{skopiowane ? '✓' : 1}</span>
            <b>Otwórz czat</b>
          </div>
          {przyciskiCzatu}
        </div>
        <div className={`tcz-karta tcz-krok ${skopiowane ? 'zrobiony' : ''}`}>
          <div className="tcz-krok-glowa">
            <span className="tcz-nr">{skopiowane ? '✓' : 2}</span>
            <b>Porozmawiaj</b>
          </div>
          <p className="tcz-szary">Odpowiadaj z pamięci, bez zaglądania. Czat sam zakończy rozmowę.</p>
        </div>
        <div className={`tcz-karta tcz-krok ${skopiowane ? 'teraz' : ''}`}>
          <div className="tcz-krok-glowa">
            <span className="tcz-nr">3</span>
            <b>Wklej podsumowanie</b>
          </div>
          <p className="tcz-szary">Skopiuj ramkę z końca rozmowy i wklej poniżej.</p>
        </div>
      </div>
      {poleWklej(true)}
      {tryb === 'rozszerzona' && wynik && (
        <p className="tcz-karta test-czatem-zapisane tcz-zapisane">
          Wynik czatu: {wynik.zaliczone ? 'zaliczone' : 'są luki'}
          {wynik.kafelki.length ? ` · ocenione kafelki: ${wynik.kafelki.length}` : ''}
        </p>
      )}
      {bramka && !proba && (
        <button
          className="tcz-link test-czatem-pomin"
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
        po ? (
          <KoniecCzatu po={po}>
            <span className="tcz-szary">
              W prawdziwej nauce sektor poszedłby dalej:{' '}
              {kopia.etap === 'zadania' || zadaniaWZero() ? 'zadania, potem test zakryty z zadaniami.' : 'powtórki.'}
            </span>
          </KoniecCzatu>
        ) : null
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
