import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useDialogs } from './Dialogs'
import { Icon } from './Icon'
import { RichEditor } from './RichEditor'
import { TestCzatem } from './TestCzatem'
import { ListaZadan } from './ZadaniaSektora'
import {
  dniDo,
  dolozDoSektora,
  kluczWezla,
  minutyPrzerwy,
  naukaOdNowa,
  ocenialny,
  opisDni,
  pominZadania,
  prognoza,
  skonczMapowanie,
  tempo,
  testOtwarty,
  usunJednostke,
  utworzFiszke,
  utworzSektor,
  uwagaWielkosci,
  wyjmijZSektora,
  zacznijMapowanie,
  zmienJednostke,
} from '../nauka'
import { pytania, wez, zasady } from '../naukaUstawienia'
import type { CelSesji } from './SesjaNauki'
import type { JednostkaNauki, PathNode } from '../types'

export type ZakladkaNauki = 'sektory' | 'mapa' | 'pytania'

interface Props {
  pathId: string
  /** Węzły ścieżki w kolejności Linii. */
  ordered: PathNode[]
  /** Zaznaczone w Linii (Ctrl+klik). */
  zaznaczone: string[]
  zakladka: ZakladkaNauki
  onZakladka: (z: ZakladkaNauki) => void
  wybrany: string | null
  onWybierz: (id: string | null) => void
  onStart?: (cel: CelSesji) => void
  /** Otwiera kafelek (zadanie) w edytorze. */
  onOtworz?: (conceptId: string) => void
  /** Sektor, do którego wybiera się kafelki klikaniem w Linii. */
  wybierany?: string | null
  onWybieraj?: (id: string | null) => void
}

/** Pokazuje węzeł w Linii (przewija do niego). */
function pokazWLinii(nodeId: string | undefined) {
  if (!nodeId) return
  document.querySelector(`.linear-view [data-seg="${nodeId}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

const godzina = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : ''

/** Panel nauki obok Linii — w widoku „Nauka" stoi tam, gdzie zwykle PDF.
 *  Sektory i spis po nich, mapa sektora, pytania do wglądu. */
export function PanelNauki({
  pathId,
  ordered,
  zaznaczone,
  zakladka,
  onZakladka,
  wybrany,
  onWybierz,
  onStart,
  onOtworz,
  wybierany,
  onWybieraj,
}: Props) {
  const dlg = useDialogs()
  const jednostki = useLiveQuery(() => db.nauka.where('pathId').equals(pathId).toArray(), [pathId]) ?? []
  const kafelki = useLiveQuery(() => db.concepts.toArray(), [])
  const pamiec = useLiveQuery(() => db.pamiec.toArray(), []) ?? []
  const kafelek = useMemo(() => new Map((kafelki ?? []).map((c) => [c.id, c])), [kafelki])
  // przerwa odlicza minuty
  const [, setTik] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setTik((x) => x + 1), 15000)
    return () => window.clearInterval(t)
  }, [])

  const indeks = useMemo(() => new Map(ordered.map((n, i) => [n.id, i])), [ordered])
  const sektory = jednostki
    .filter((j) => j.rodzaj === 'sektor')
    .map((j) => ({ j, wezly: ordered.filter((n) => j.wezly.includes(n.id)) }))
    .sort((a, b) => (indeks.get(a.wezly[0]?.id) ?? 1e9) - (indeks.get(b.wezly[0]?.id) ?? 1e9))
  const fiszki = jednostki.filter((j) => j.rodzaj === 'fiszka')
  const wSektorach = new Set(sektory.flatMap((s) => s.j.wezly))
  const poza = ordered.filter((n) => ocenialny(n) && !wSektorach.has(n.id))
  const zazOcenialne = zaznaczone.filter((id) => {
    const n = ordered.find((x) => x.id === id)
    return n && n.kind !== 'comment'
  })
  /** Kiedy ostatnio zmieniła się TREŚĆ kafelka (wersje i strony) — zmiana
   *  nazwy czy przeniesienie do folderu to nie jest nowa treść do nauki. */
  const idsKafelkow = [
    ...new Set(sektory.flatMap((s) => s.wezly.flatMap((n) => (n.kind === 'block' ? [n.conceptId] : [])))),
  ].sort()
  const zmianaTresci =
    useLiveQuery(async () => {
      const [w, st] = await Promise.all([
        db.versions.where('conceptId').anyOf(idsKafelkow).toArray(),
        db.subpages.where('conceptId').anyOf(idsKafelkow).toArray(),
      ])
      const m = new Map<string, string>()
      for (const x of [...w, ...st]) if (x.updatedAt > (m.get(x.conceptId) ?? '')) m.set(x.conceptId, x.updatedAt)
      return m
    }, [idsKafelkow.join()]) ?? new Map<string, string>()

  const nazwaWezla = (n: PathNode): string =>
    n.kind === 'block'
      ? (n.nazwa ?? kafelek.get(n.conceptId)?.name ?? '?')
      : n.kind === 'fusion'
        ? n.name || 'Grupa'
        : n.kind === 'heading'
          ? n.text
          : 'Notatka'

  const wybranySektor = sektory.find((s) => s.j.id === wybrany) ?? sektory[0]

  // ---- tworzenie ----
  const zZaznaczonych = async () => {
    if (!zazOcenialne.length) return
    const pierwszy = ordered.find((n) => zazOcenialne.includes(n.id))
    const nazwa = await dlg.prompt({
      title: 'Nowy sektor',
      label: 'Nazwa sektora',
      value: pierwszy ? nazwaWezla(pierwszy) : '',
      confirmLabel: 'Utwórz',
    })
    if (!nazwa?.trim()) return
    // w kolejności Linii
    const wezly = ordered.filter((n) => zazOcenialne.includes(n.id)).map((n) => n.id)
    const id = await utworzSektor(pathId, nazwa.trim(), wezly)
    onWybierz(id)
  }

  /** Pusty sektor — kafelki wybiera się potem klikaniem w Linii. */
  const pusty = async () => {
    const nazwa = await dlg.prompt({ title: 'Nowy sektor', label: 'Nazwa sektora', value: '', confirmLabel: 'Utwórz' })
    if (!nazwa?.trim()) return
    const id = await utworzSektor(pathId, nazwa.trim(), [])
    onWybierz(id)
    onWybieraj?.(id)
  }

  const poziomy = [...new Set(ordered.filter((n) => n.kind === 'heading').map((n) => (n.kind === 'heading' ? n.level : 0)))].sort()
  const zRozdzialow = async (poziom: number) => {
    let ile = 0
    for (let i = 0; i < ordered.length; i++) {
      const h = ordered[i]
      if (h.kind !== 'heading' || h.level !== poziom) continue
      const wezly: string[] = []
      for (let k = i + 1; k < ordered.length; k++) {
        const n = ordered[k]
        if (n.kind === 'heading' && n.level <= poziom) break
        if (n.kind === 'comment' || wSektorach.has(n.id)) continue
        wezly.push(n.id)
      }
      if (!wezly.some((id) => ocenialny(ordered[indeks.get(id)!]))) continue
      await utworzSektor(pathId, h.text || 'Sektor', wezly)
      ile++
    }
    window.dispatchEvent(
      new CustomEvent('komp:komunikat', {
        detail: ile ? `Utworzono sektory: ${ile}` : 'Nie było rozdziałów z wolnymi kafelkami',
      }),
    )
  }

  // ---- powtórka zero ----
  const zacznij = async (s: { j: JednostkaNauki; wezly: PathNode[] }) => {
    const t = await tempo()
    const n = s.wezly.filter(ocenialny).length
    const test = Math.round(t.podstawa + t.naKafelek * n)
    const prog = wez('prog')
    const obciazenie = prog > 0 ? await prognoza() : 0
    const nadProgiem =
      prog > 0 && obciazenie > prog
        ? `\n\nUwaga: w najbliższych dwóch tygodniach powtórki zajmą średnio ok. ${Math.round(obciazenie)} min dziennie, a twój próg to ${prog} min. Nowy sektor dołoży kolejne — możesz zacząć mimo to.`
        : ''
    const ok = await dlg.confirm({
      title: `Nauka sektora „${s.j.nazwa}"`,
      message:
        `Upewnij się, że masz czas na całość: mapowanie (zwykle godzina, dwie), ` +
        `przerwę ${wez('przerwa')}–${wez('przypomnij')} min i test (ok. ${test} min). ` +
        `Jeśli dziś tyle nie masz — lepiej innym razem, inaczej przerwa i test się rozjadą.` +
        nadProgiem,
      confirmLabel: 'Zaczynam',
      cancelLabel: 'Innym razem',
    })
    if (!ok) return
    await zacznijMapowanie(s.j.id)
    onWybierz(s.j.id)
    onZakladka('mapa')
  }

  const koniecMapowania = async (j: JednostkaNauki) => {
    await skonczMapowanie(j.id)
    // powiadomienie o teście — przeglądarka pyta raz
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }

  const odNowa = async (j: JednostkaNauki) => {
    const ok = await dlg.confirm({
      title: `Nauczyć „${j.nazwa}" od nowa?`,
      message:
        'Sektor wraca do powtórki zero: mapowanie, przerwa, test. Historia powtórek zostaje, kafelki też.',
      confirmLabel: 'Naucz od nowa',
    })
    if (ok) await naukaOdNowa(j.id)
  }

  const usun = async (j: JednostkaNauki) => {
    const ok = await dlg.confirm({
      title: `Usunąć sektor „${j.nazwa}"?`,
      message: 'Kafelki zostają nietknięte w ścieżce i w bibliotece. Znika tylko sektor, jego mapa i termin; historia powtórek zostaje.',
      confirmLabel: 'Usuń sektor',
      danger: true,
    })
    if (ok) {
      await usunJednostke(j.id)
      if (wybrany === j.id) onWybierz(null)
    }
  }

  const zmienNazwe = async (j: JednostkaNauki) => {
    const nazwa = await dlg.prompt({ title: 'Nazwa sektora', value: j.nazwa, confirmLabel: 'Zapisz' })
    if (nazwa?.trim()) await zmienJednostke(j.id, { nazwa: nazwa.trim() })
  }

  const fiszka = async (n: PathNode) => {
    if (n.kind !== 'block') return
    await utworzFiszke({ conceptId: n.conceptId, nazwa: nazwaWezla(n), pathId, nodeId: n.id })
    window.dispatchEvent(new CustomEvent('komp:komunikat', { detail: 'Dodano do powtórek jako fiszkę' }))
  }

  /** Czy treść kafelków zmieniła się od ostatniej powtórki. */
  const zmieniony = (j: JednostkaNauki, wezly: PathNode[]) =>
    !!j.ostatnia &&
    wezly.some((n) => n.kind === 'block' && (zmianaTresci.get(n.conceptId) ?? '') > (j.ostatnia ?? ''))

  const slabeW = (wezly: PathNode[]) =>
    wezly.filter((n) => {
      const k = kluczWezla(n, pathId)
      return k && pamiec.find((p) => p.klucz === k)?.slaby
    }).length

  return (
    <aside className="panel-nauki">
      <nav className="panel-nauki-zakladki">
        {(
          [
            ['sektory', 'Sektory'],
            ['mapa', 'Mapa'],
            ['pytania', 'Pytania'],
          ] as [ZakladkaNauki, string][]
        ).map(([z, n]) => (
          <button key={z} className={`btn ${zakladka === z ? 'btn-active' : ''}`} onClick={() => onZakladka(z)}>
            {n}
          </button>
        ))}
      </nav>

      {zakladka === 'sektory' && (
        <div className="panel-nauki-tresc">
          <div className="panel-nauki-akcje">
            <button
              className="btn btn-primary"
              disabled={!zazOcenialne.length}
              title={zazOcenialne.length ? '' : 'Zaznacz kafelki w Linii (Ctrl+klik, Shift+klik)'}
              onClick={zZaznaczonych}
            >
              Sektor z zaznaczonych{zazOcenialne.length ? ` (${zazOcenialne.length})` : ''}
            </button>
            <button className="btn" title="Pusty sektor — kafelki wybierzesz klikaniem w Linii" onClick={pusty}>
              Nowy pusty sektor
            </button>
            {poziomy.length > 0 && (
              <span className="panel-nauki-rozdzialy">
                z rozdziałów:
                {poziomy.map((p) => (
                  <button key={p} className="btn" title={`Każdy rozdział poziomu H${p} staje się sektorem`} onClick={() => zRozdzialow(p)}>
                    H{p}
                  </button>
                ))}
              </span>
            )}
          </div>
          {wybierany && sektory.some((s) => s.j.id === wybierany) && (
            <div className="wybieranie-pasek" style={{ '--sektor': sektory.find((s) => s.j.id === wybierany)?.j.kolor } as React.CSSProperties}>
              <span>
                Wybierasz kafelki do <strong>„{sektory.find((s) => s.j.id === wybierany)?.j.nazwa}"</strong> — klikaj
                w Linii, aby dodać albo wyjąć.
              </span>
              <button className="btn btn-primary btn-maly" onClick={() => onWybieraj?.(null)}>
                Gotowe
              </button>
            </div>
          )}
          {!sektory.length && (
            <p className="hint">
              Sektor to porcja nauki: kilka kafelków (rozsądnie {wez('sektorOd')}–{wez('sektorDo')}), które
              mapujesz i powtarzasz razem. Zaznacz je w Linii Ctrl+klikiem, zrób pusty sektor i wybierz kafelki
              klikaniem albo kliknij prawym rozdział (w Linii lub w spisie treści) → „Zrób sektor z rozdziału".
            </p>
          )}
          <ul className="sektory-lista">
            {sektory.map((s) => (
              <KartaSektora
                key={s.j.id}
                s={s}
                aktywny={wybranySektor?.j.id === s.j.id}
                zaznaczone={zazOcenialne}
                slabe={slabeW(s.wezly)}
                zmieniony={zmieniony(s.j, s.wezly)}
                nazwaWezla={nazwaWezla}
                onWybierz={() => {
                  onWybierz(s.j.id)
                  pokazWLinii(s.wezly[0]?.id)
                }}
                onMapa={() => {
                  onWybierz(s.j.id)
                  onZakladka('mapa')
                }}
                onZacznij={() => zacznij(s)}
                onKoniecMapowania={() => koniecMapowania(s.j)}
                onTest={() => onStart?.({ jednostkaId: s.j.id })}
                onOdNowa={() => odNowa(s.j)}
                onUsun={() => usun(s.j)}
                onNazwa={() => zmienNazwe(s.j)}
                onDoloz={() => dolozDoSektora(s.j.id, zazOcenialne)}
                onWyjmij={() => wyjmijZSektora(s.j.id, zazOcenialne)}
                onOtworz={onOtworz}
                wybieranie={wybierany === s.j.id}
                onWybieranie={() => {
                  onWybierz(s.j.id)
                  onWybieraj?.(wybierany === s.j.id ? null : s.j.id)
                }}
              />
            ))}
          </ul>
          {poza.length > 0 && (
            <details className="sektory-poza" open={sektory.length > 0}>
              <summary>Poza sektorami ({poza.length})</summary>
              <ul>
                {poza.map((n) => {
                  const f = n.kind === 'block' ? fiszki.find((x) => x.conceptId === n.conceptId) : undefined
                  return (
                    <li key={n.id}>
                      <button className="sektory-poza-nazwa" onClick={() => pokazWLinii(n.id)}>
                        {nazwaWezla(n)}
                      </button>
                      {f ? (
                        <span className="znaczek" title="Uczysz się go osobno">
                          fiszka{f.termin ? ` · ${opisDni(dniDo(f.termin))}` : ''}
                        </span>
                      ) : (
                        n.kind === 'block' && (
                          <button className="btn btn-maly" title="Powtarzaj ten kafelek osobno, poza sektorem" onClick={() => fiszka(n)}>
                            Ucz się osobno
                          </button>
                        )
                      )}
                    </li>
                  )
                })}
              </ul>
            </details>
          )}
        </div>
      )}

      {zakladka === 'mapa' && (
        <div className="panel-nauki-tresc">
          {wybranySektor ? (
            <MapaSektora key={wybranySektor.j.id} j={wybranySektor.j} sektory={sektory.map((s) => s.j)} onWybierz={onWybierz} />
          ) : (
            <p className="hint">Najpierw zrób sektor — mapa należy do sektora.</p>
          )}
        </div>
      )}

      {zakladka === 'pytania' && (
        <div className="panel-nauki-tresc">
          <h3 className="panel-nauki-naglowek">Pytania nauki</h3>
          <p className="hint">Do wglądu przy mapowaniu — nie formularz. Te same pytania wracają w teście.</p>
          <ol className="panel-nauki-pytania">
            {pytania().map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
          <h3 className="panel-nauki-naglowek">Zasady mapowania</h3>
          <ul className="panel-nauki-pytania">
            {zasady().map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="hint">Obie listy zmienisz w Ustawieniach → Nauka.</p>
        </div>
      )}
    </aside>
  )
}

function KartaSektora({
  s,
  aktywny,
  zaznaczone,
  slabe,
  zmieniony,
  nazwaWezla,
  onWybierz,
  onMapa,
  onZacznij,
  onKoniecMapowania,
  onTest,
  onOdNowa,
  onUsun,
  onNazwa,
  onDoloz,
  onWyjmij,
  onOtworz,
  wybieranie,
  onWybieranie,
}: {
  s: { j: JednostkaNauki; wezly: PathNode[] }
  aktywny: boolean
  zaznaczone: string[]
  slabe: number
  zmieniony: boolean
  nazwaWezla: (n: PathNode) => string
  onWybierz: () => void
  onMapa: () => void
  onZacznij: () => void
  onKoniecMapowania: () => void
  onTest: () => void
  onOdNowa: () => void
  onUsun: () => void
  onNazwa: () => void
  onDoloz: () => void
  onWyjmij: () => void
  onOtworz?: (conceptId: string) => void
  wybieranie?: boolean
  onWybieranie?: () => void
}) {
  const { j, wezly } = s
  const [menu, setMenu] = useState(false)
  const kafelkow = wezly.filter(ocenialny)
  const uwaga = uwagaWielkosci(kafelkow.length)
  const poprawki = new Set(j.doPoprawy ?? [])
  const zostalo = Math.max(0, Math.ceil(wez('przerwa') - minutyPrzerwy(j)))
  const wTym = zaznaczone.filter((id) => j.wezly.includes(id)).length
  const spoza = zaznaczone.length - wTym

  return (
    <li className={`karta-sektora ${aktywny ? 'aktywna' : ''} ${wybieranie ? 'wybieranie' : ''}`} style={{ '--sektor': j.kolor } as React.CSSProperties} data-sektor={j.id}>
      <div className="karta-sektora-glowa">
        <button className="karta-sektora-nazwa" onClick={onWybierz} title="Pokaż w Linii">
          <span className="karta-sektora-kropka" />
          {j.nazwa}
        </button>
        <span className="karta-sektora-ile">{kafelkow.length} kaf.</span>
        <button className="folder-action" title="Więcej" onClick={() => setMenu((m) => !m)}>
          ⋯
        </button>
      </div>
      {uwaga && <p className="karta-sektora-uwaga">{uwaga}</p>}
      <div className="karta-sektora-sklad">
        <button
          className={`btn btn-maly ${wybieranie ? 'btn-active' : ''}`}
          title="Klikaj kafelki w Linii — każdy klik dodaje albo wyjmuje"
          onClick={onWybieranie}
        >
          {wybieranie ? 'Gotowe' : 'Wybierz kafelki'}
        </button>
        {spoza > 0 && (
          <button className="btn btn-maly" onClick={onDoloz}>
            Dodaj zaznaczone ({spoza})
          </button>
        )}
        {wTym > 0 && (
          <button className="btn btn-maly" onClick={onWyjmij}>
            Wyjmij zaznaczone ({wTym})
          </button>
        )}
      </div>
      {menu && (
        <div className="karta-sektora-menu" onClick={() => setMenu(false)}>
          <button className="btn btn-maly" onClick={onNazwa}>Zmień nazwę</button>
          <button className="btn btn-maly" onClick={onMapa}>Mapa</button>
          {j.etap !== 'nowy' && <button className="btn btn-maly" onClick={onOdNowa}>Naucz od nowa</button>}
          <button className="btn btn-maly btn-danger" onClick={onUsun}>Usuń sektor</button>
        </div>
      )}
      <div className="karta-sektora-etap">
        {j.etap === 'nowy' && (
          <>
            <span>Jeszcze nie uczony</span>
            <button className="btn btn-primary btn-maly" onClick={onZacznij}>
              Zacznij naukę
            </button>
          </>
        )}
        {j.etap === 'mapowanie' && (
          <>
            <span>
              {j.doPoprawy?.length ? `Popraw mapowanie (${j.doPoprawy.length})` : 'Mapowanie'}
              {j.etapOd && <span className="karta-sektora-czas"> od {godzina(j.etapOd)}</span>}
            </span>
            <button className="btn btn-primary btn-maly" onClick={onKoniecMapowania}>
              Skończyłem mapowanie
            </button>
          </>
        )}
        {j.etap === 'przerwa' &&
          (testOtwarty(j) ? (
            <>
              <span>Po przerwie — test gotowy</span>
              <button className="btn btn-primary btn-maly" onClick={onTest}>
                Zacznij test
              </button>
            </>
          ) : (
            <span className="karta-sektora-przerwa">
              <Icon name="przerwa" size={0.95} /> Przerwa — test za {zostalo} min. Odejdź od tego na chwilę.
            </span>
          ))}
        {j.etap === 'czat' && <span>{j.luki ? 'Luki z czatu — popraw i dogrywka' : 'Test zaliczony — teraz test czatem'}</span>}
        {j.etap === 'zadania' && (
          <>
            <span>
              {j.doPoprawy?.length
                ? `Test końcowy — do poprawy (${j.doPoprawy.length})`
                : 'Zadania (opcjonalne), potem test końcowy'}
            </span>
            <button
              className="btn btn-primary btn-maly"
              disabled={!j.zadania?.length}
              title={j.zadania?.length ? 'Zakryty test całego sektora, już z zadaniami' : 'Najpierw dodaj zadania — albo pomiń je'}
              onClick={onTest}
            >
              Test końcowy
            </button>
            <button className="btn btn-link" title="Powtórka zero kończy się bez zadań" onClick={() => pominZadania(j.id)}>
              Bez zadań — do powtórek
            </button>
          </>
        )}
        {j.etap === 'powtorki' && j.termin && (
          <>
            <span>
              Powtórka {opisDni(dniDo(j.termin))}
              {slabe > 0 && <span className="znaczek"> słabe: {slabe}</span>}
            </span>
            <button className="btn btn-maly" title="Powtórz teraz, przed terminem" onClick={onTest}>
              Powtórz teraz
            </button>
          </>
        )}
      </div>
      {j.etap === 'czat' && <TestCzatem j={j} tryb="zero" />}
      {j.etap === 'zadania' && (
        <p className="hint karta-sektora-rada">
          Rozwiąż zadania — z podręcznika albo wygenerowane czatem. Zapisz rozwiązanie i metodę,
          a metodę przeanalizuj i dopisz do mapy. Potem test końcowy: zakryty, już z zadaniami.
        </p>
      )}
      {(aktywny || j.etap === 'zadania') && <ListaZadan j={j} onOtworz={onOtworz} />}
      {j.etap === 'powtorki' && j.luki && (
        <details className="karta-sektora-uwaga">
          <summary>Luki z ostatniego czatu</summary>
          <pre className="test-czatem-zapisane">{j.luki}</pre>
        </details>
      )}
      {zmieniony && j.etap === 'powtorki' && (
        <p className="karta-sektora-uwaga">
          Treść zmieniła się od ostatniej powtórki.{' '}
          <button className="btn btn-link" onClick={onOdNowa}>
            Naucz od nowa
          </button>
        </p>
      )}
      {aktywny && (
        <ol className="karta-sektora-spis">
          {wezly
            .filter((n) => n.kind !== 'comment')
            .map((n) => (
              <li
                key={n.id}
                className={`${n.kind === 'heading' ? 'spis-rozdzial' : ''} ${poprawki.has(n.id) ? 'do-poprawy' : ''}`}
              >
                <button onClick={() => pokazWLinii(n.id)}>{nazwaWezla(n)}</button>
              </li>
            ))}
        </ol>
      )}
    </li>
  )
}

function MapaSektora({
  j,
  sektory,
  onWybierz,
}: {
  j: JednostkaNauki
  sektory: JednostkaNauki[]
  onWybierz: (id: string) => void
}) {
  // zapis z małym opóźnieniem — pisanie nie może czekać na bazę
  const czas = useRef<number | undefined>(undefined)
  const ostatni = useRef(j.mapa ?? '')
  useEffect(
    () => () => {
      window.clearTimeout(czas.current)
    },
    [],
  )
  const zmien = (md: string) => {
    ostatni.current = md
    window.clearTimeout(czas.current)
    czas.current = window.setTimeout(() => void zmienJednostke(j.id, { mapa: ostatni.current }), 400)
  }
  return (
    <div className="mapa-sektora">
      <div className="mapa-sektora-glowa">
        <select
          className="mapa-sektora-wybor"
          value={j.id}
          aria-label="Sektor"
          onChange={(e) => onWybierz(e.target.value)}
        >
          {sektory.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nazwa}
            </option>
          ))}
        </select>
      </div>
      {j.luki && (
        <div className="test-czatem-luki">
          <strong>Luki z czatu</strong> — popraw mapowanie tych miejsc:
          <pre>{j.luki}</pre>
        </div>
      )}
      <details className="mapa-sektora-zasady">
        <summary>Jak mapować</summary>
        <ul>
          {zasady().map((z) => (
            <li key={z}>{z}</li>
          ))}
        </ul>
      </details>
      <div className="mapa-sektora-pole">
        <RichEditor value={j.mapa ?? ''} editable ruler={false} onChange={zmien} />
      </div>
      <p className="hint">
        Najprostsza forma przedstawienia sektora: punkty, wzory, zdjęcie mapy narysowanej na papierze.
        W teście mapa jest zakryta — odtwarzasz ją z pamięci.
      </p>
    </div>
  )
}

