import { useEffect, useRef, useState } from 'react'
import { exportBackup, importBackup } from '../backup'
import {
  ileTutaj,
  migawkaDoPliku,
  migawkaZPliku,
  ostatnioPobrano,
  ostatnioWyslano,
  pobierzNotatki,
  sprawdzKlucz,
  telefonRepo,
  telefonToken,
  wyslijNotatki,
  zapiszUstawieniaTelefonu,
} from '../telefon'
import {
  BG_PATTERN_OPTIONS,
  BLOCK_TINT_MAX,
  BLOCK_TINT_MIN,
  ZDJECIE_SZEROKOSC_MAX,
  ZDJECIE_SZEROKOSC_MIN,
  CONTENT_FONT_OPTIONS,
  type BgPattern,
  type ContentFont,
  IND_OFFSET_MAX,
  IND_OFFSET_MIN,
  LINE_SPACING_OPTIONS,
  MATH_GAP_OPTIONS,
  MATH_SCALE_OPTIONS,
  PAGE_WIDTH_MAX,
  PAGE_WIDTH_MIN,
  PARA_SPACING_OPTIONS,
  TREE_SIZE_MAX,
  TEKST_KAFELKA_MAX,
  TEKST_KAFELKA_MIN,
  TREE_SIZE_MIN,
  getBgPattern,
  getBlockTint,
  getZdjecieSzerokosc,
  getContentFont,
  getIndOffset,
  getLineSpacing,
  getMathGap,
  getMathScale,
  getPageWidth,
  getPageWidthDefault,
  getParaSpacing,
  getTekstKafelka,
  getTreeSize,
  setBgPattern,
  setBlockTint,
  setZdjecieSzerokosc,
  setContentFont,
  setIndOffset,
  setLineSpacing,
  setMathGap,
  setMathScale,
  setPageWidth,
  setPageWidthDefault,
  setParaSpacing,
  setTekstKafelka,
  setTreeSize,
} from '../uiSettings'
import { PoleLiczby } from './PoleLiczby'
import { UstawieniaNauki } from './UstawieniaNauki'
import { UstawieniaProgramu } from './UstawieniaProgramu'
import { TypeEditor } from './TypeEditor'
import { useDialogs } from './Dialogs'

interface Props {
  onClose: () => void
}

type Section = 'wyglad' | 'tekst' | 'typy' | 'nauka' | 'dane' | 'program'

const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: 'wyglad', label: 'Wygląd', hint: 'Motyw, wielkość list, szerokość strony' },
  { id: 'tekst', label: 'Tekst', hint: 'Odstępy, wzory, linijka' },
  { id: 'typy', label: 'Typy kafelków', hint: 'Nazwy, skróty, barwy, własne typy' },
  { id: 'nauka', label: 'Nauka', hint: 'Cel zapamiętania, przerwa, pytania' },
  { id: 'dane', label: 'Dane', hint: 'Kopia zapasowa i gdzie to wszystko siedzi' },
  { id: 'program', label: 'Program', hint: 'Aktualizacje, start z Windows, kopie w folderze' },
]

/** Ustawienia jako pełna strona w środkowym panelu — jest miejsce na sekcje
 *  i wyjaśnienia, a powrót do poprzedniego widoku odbywa się przyciskiem. */
export function SettingsPage({ onClose }: Props) {
  const dlg = useDialogs()
  const [section, setSection] = useState<Section>('wyglad')

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme ?? 'light',
  )
  const [width, setWidth] = useState(getPageWidth)
  const [widthDef, setWidthDef] = useState(getPageWidthDefault)
  const [indOff, setIndOff] = useState(getIndOffset)
  const [treeSize, setTree] = useState(getTreeSize)
  const [tekstKafelka, setTekst] = useState(getTekstKafelka)
  const [tint, setTint] = useState(getBlockTint)
  const [zdjecie, setZdjecie] = useState(getZdjecieSzerokosc)
  const [line, setLine] = useState(getLineSpacing)
  const [para, setPara] = useState(getParaSpacing)
  const [mScale, setMScale] = useState(getMathScale)
  const [mGap, setMGap] = useState(getMathGap)
  const [font, setFont] = useState(getContentFont)
  const [bg, setBg] = useState(getBgPattern)

  // linijka nad edytorem zmienia te same ustawienia — trzymaj suwaki w zgodzie
  useEffect(() => {
    const h = () => {
      setWidth(getPageWidth())
      setWidthDef(getPageWidthDefault())
      setIndOff(getIndOffset())
      setTree(getTreeSize())
      setTekst(getTekstKafelka())
      setTint(getBlockTint())
      setZdjecie(getZdjecieSzerokosc())
      setLine(getLineSpacing())
      setPara(getParaSpacing())
      setMScale(getMathScale())
      setMGap(getMathGap())
      setFont(getContentFont())
      setBg(getBgPattern())
    }
    window.addEventListener('komp:ui', h)
    return () => window.removeEventListener('komp:ui', h)
  }, [])

  const applyTheme = (t: 'light' | 'dark') => {
    setTheme(t)
    document.documentElement.dataset.theme = t
    localStorage.setItem('ui.theme', t)
  }

  const [busy, setBusy] = useState<
    | 'export'
    | 'import'
    | 'wyslij'
    | 'pobierz'
    | 'plik-zapis'
    | 'plik-czyt'
    | 'sprawdzam'
    | null
  >(null)
  const [status, setStatus] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ---- notatki na telefonie ----
  const [token, setToken] = useState(telefonToken)
  const [repo, setRepo] = useState(telefonRepo)
  const [statusTel, setStatusTel] = useState<string | null>(null)
  const [pokazKlucz, setPokazKlucz] = useState(false)
  const migRef = useRef<HTMLInputElement>(null)

  const handleMigawkaPlik = async () => {
    setBusy('plik-zapis')
    setStatusTel(null)
    try {
      const w = await migawkaDoPliku()
      setStatusTel(
        `Zapisane do pliku: ${w.kafelki} kafelków, ${w.sciezki} ścieżek (${w.rozmiarKB} kB). ` +
          'Przenieś plik na telefon i tam kliknij „Migawka z pliku".',
      )
    } catch (e) {
      setStatusTel(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const handleMigawkaZPliku = async (plik: File | undefined) => {
    if (!plik) return
    const przed = await ileTutaj()
    const ok = await dlg.confirm({
      title: 'Wczytać notatki z pliku?',
      message:
        `Na tym urządzeniu jest teraz ${przed.kafelki} kafelków i ${przed.sciezki} ścieżek. ` +
        'Kafelki o tych samych identyfikatorach zostaną nadpisane, a te, których ' +
        'w pliku nie ma, zostaną nietknięte. Nic nie jest kasowane.',
      confirmLabel: 'Wczytaj',
    })
    if (!ok) {
      if (migRef.current) migRef.current.value = ''
      return
    }
    setBusy('plik-czyt')
    setStatusTel(null)
    try {
      const w = await migawkaZPliku(plik)
      const po = await ileTutaj()
      setStatusTel(
        `Wczytane z pliku (migawka z ${new Date(w.zDnia).toLocaleString('pl')}): ` +
          `${w.kafelki} kafelków, ${w.sciezki} ścieżek. Tutaj było ${przed.kafelki}, jest ${po.kafelki}.`,
      )
    } catch (e) {
      setStatusTel(`Nie wczytano: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
      if (migRef.current) migRef.current.value = ''
    }
  }

  const handleWyslij = async () => {
    zapiszUstawieniaTelefonu(token, repo)
    setBusy('wyslij')
    setStatusTel(null)
    try {
      const w = await wyslijNotatki()
      setStatusTel(
        `Wysłane: ${w.kafelki} kafelków, ${w.sciezki} ścieżek (${w.rozmiarKB} kB). ` +
          'Na telefonie kliknij „Pobierz notatki".',
      )
    } catch (e) {
      setStatusTel(`Nie wysłano: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const handlePobierz = async () => {
    zapiszUstawieniaTelefonu(token, repo)
    const przed = await ileTutaj()
    const ok = await dlg.confirm({
      title: 'Pobrać notatki z komputera?',
      message:
        `Na tym urządzeniu jest teraz ${przed.kafelki} kafelków i ${przed.sciezki} ścieżek. ` +
        'Kafelki o tych samych identyfikatorach zostaną nadpisane treścią z komputera, ' +
        'a te, których w migawce nie ma, zostaną nietknięte. Nic nie jest kasowane.',
      confirmLabel: 'Pobierz',
    })
    if (!ok) return
    setBusy('pobierz')
    setStatusTel(null)
    try {
      const w = await pobierzNotatki()
      const po = await ileTutaj()
      setStatusTel(
        `Pobrano migawkę z ${new Date(w.zDnia).toLocaleString('pl')}: ` +
          `${w.kafelki} kafelków, ${w.sciezki} ścieżek. ` +
          `Tutaj było ${przed.kafelki}, jest ${po.kafelki}.`,
      )
    } catch (e) {
      setStatusTel(`Nie pobrano: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const handleExport = async () => {
    setBusy('export')
    setStatus(null)
    try {
      if (await exportBackup()) setStatus('Kopia zapasowa zapisana.')
    } catch (e) {
      setStatus(`Błąd eksportu: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return
    const ok = await dlg.confirm({
      title: 'Wczytać kopię zapasową?',
      message:
        'Kafelki, wersje, foldery, ścieżki, typy i PDF-y o tych samych ' +
        'identyfikatorach co w kopii zostaną nadpisane. Reszta danych zostaje ' +
        'bez zmian. Wrócą też ustawienia wyglądu zapisane w kopii.',
      confirmLabel: 'Wczytaj kopię',
    })
    if (!ok) {
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setBusy('import')
    setStatus(null)
    try {
      const s = await importBackup(file)
      setStatus(
        `Wczytano: ${s.concepts} kafelków, ${s.versions} wersji, ${s.folders} folderów, ` +
          `${s.paths} ścieżek, ${s.pdfs} PDF-ów.`,
      )
    } catch (e) {
      setStatus(`Błąd importu: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /** Rząd przycisków wyboru z jednej listy wartości. */
  const choice = <T,>(
    values: readonly T[],
    current: T,
    apply: (v: T) => void,
    label: (v: T) => string,
  ) => (
    <div className="settings-choice">
      {values.map((v, i) => (
        <button
          key={i}
          className={`btn settings-choice-btn ${current === v ? 'btn-active' : ''}`}
          onClick={() => apply(v)}
        >
          {label(v)}
        </button>
      ))}
    </div>
  )

  return (
    <section className="settings-page">
      <header className="settings-page-head">
        <h2>Ustawienia</h2>
        <button className="btn" onClick={onClose}>
          ← Wróć
        </button>
      </header>

      <div className="settings-page-body">
        <nav className="settings-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`settings-nav-item ${section === s.id ? 'active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              <span className="settings-nav-label">{s.label}</span>
              <span className="settings-nav-hint">{s.hint}</span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {section === 'nauka' && <UstawieniaNauki />}
          {section === 'program' && <UstawieniaProgramu />}
          {section === 'wyglad' && (
            <>
              <div className="settings-row">
                <span className="settings-label">Motyw</span>
                <div className="view-switch">
                  <button
                    className={`btn ${theme === 'light' ? 'btn-active' : ''}`}
                    onClick={() => applyTheme('light')}
                  >
                    ☀ Jasny
                  </button>
                  <button
                    className={`btn ${theme === 'dark' ? 'btn-active' : ''}`}
                    onClick={() => applyTheme('dark')}
                  >
                    ☾ Ciemny
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <span className="settings-label">Deseń tła</span>
                <div className="settings-bg-choice">
                  {BG_PATTERN_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      className={`settings-bg-btn ${bg === o.value ? 'active' : ''}`}
                      data-bg-preview={o.value}
                      onClick={() => setBgPattern(o.value as BgPattern)}
                    >
                      <span className="settings-bg-swatch" />
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="settings-hint">Tylko na marginesach — nigdy pod tekstem.</p>
              </div>

              <div className="settings-row">
                <span className="settings-label">
                  Wielkość tekstu w liście kafelków i folderów
                  <span className="settings-value">{treeSize}px</span>
                </span>
                <input
                  className="settings-slider"
                  type="range"
                  min={TREE_SIZE_MIN}
                  max={TREE_SIZE_MAX}
                  step={1}
                  value={treeSize}
                  onChange={(e) => setTreeSize(Number(e.target.value))}
                />
              </div>

              <div className="settings-row">
                <span className="settings-label">
                  Wielkość tekstu w kafelkach
                  <span className="settings-value">{tekstKafelka}px</span>
                </span>
                <input
                  className="settings-slider"
                  type="range"
                  min={TEKST_KAFELKA_MIN}
                  max={TEKST_KAFELKA_MAX}
                  step={1}
                  value={tekstKafelka}
                  onChange={(e) => setTekstKafelka(Number(e.target.value))}
                />
              </div>

              <div className="settings-row">
                <span className="settings-label">
                  Szerokość strony tekstu
                  <span className="settings-value">{width}px</span>
                </span>
                <input
                  className="settings-slider"
                  type="range"
                  min={PAGE_WIDTH_MIN}
                  max={PAGE_WIDTH_MAX}
                  step={20}
                  value={width}
                  onChange={(e) => setPageWidth(Number(e.target.value))}
                />
                <p className="settings-hint">To samo robią trójkąciki na linijce nad edytorem.</p>
              </div>

              <div className="settings-row">
                <span className="settings-label">
                  Bazowa szerokość strony
                  <span className="settings-value">{widthDef}px</span>
                </span>
                <input
                  className="settings-slider"
                  type="range"
                  min={PAGE_WIDTH_MIN}
                  max={PAGE_WIDTH_MAX}
                  step={20}
                  value={widthDef}
                  onChange={(e) => setPageWidthDefault(Number(e.target.value))}
                />
                <p className="settings-hint">
                  Do tej szerokości wraca dwuklik trójkącika i ją pokazują kreseczki.
                </p>
              </div>

              <div className="settings-row">
                <span className="settings-label">
                  Odsunięcie znaczników wcięć
                  <span className="settings-value">{indOff}px</span>
                </span>
                <input
                  className="settings-slider"
                  type="range"
                  min={IND_OFFSET_MIN}
                  max={IND_OFFSET_MAX}
                  step={2}
                  value={indOff}
                  onChange={(e) => setIndOffset(Number(e.target.value))}
                />
                <p className="settings-hint">Zarazem margines tekstu na kartce.</p>
              </div>
            </>
          )}

          {section === 'tekst' && (
            <>
              <div className="settings-row">
                <span className="settings-label">Krój pisma treści</span>
                {/* każdy przycisk pisany swoim krojem — widać wybór, zanim się kliknie */}
                <div className="settings-fonts">
                  {choice(
                    CONTENT_FONT_OPTIONS.map((o) => o.value),
                    font,
                    (v: ContentFont) => setContentFont(v),
                    (v) => CONTENT_FONT_OPTIONS.find((o) => o.value === v)?.label ?? '',
                  )}
                </div>
                <p className="settings-hint">Dotyczy treści kafelków — interfejs zostaje bezszeryfowy.</p>
                <details className="settings-wiecej">
                  <summary>Który krój wybrać</summary>
                  <p>Szeryfowy lepiej trzyma towarzystwo wzorom, bo KaTeX też jest szeryfowy — tekst i wzór wyglądają wtedy jak jedno pismo.</p>
                </details>
              </div>
              <div className="settings-row">
                <span className="settings-label">Interlinia</span>
                {choice(LINE_SPACING_OPTIONS, line, setLineSpacing, (v) =>
                  v.toLocaleString('pl-PL', { minimumFractionDigits: 1 }),
                )}
              </div>
              <div className="settings-row">
                <span className="settings-label">Odstęp między akapitami</span>
                {choice(
                  PARA_SPACING_OPTIONS.map((o) => o.value),
                  para,
                  setParaSpacing,
                  (v) => PARA_SPACING_OPTIONS.find((o) => o.value === v)?.label ?? '',
                )}
              </div>
              <div className="settings-row">
                <span className="settings-label">Wielkość wzorów (względem tekstu)</span>
                {choice(MATH_SCALE_OPTIONS, mScale, setMathScale, (v) =>
                  `${Math.round(v * 100)}%`,
                )}
                <p className="settings-hint">Przy 100% wzór jest wielkości sąsiedniego tekstu.</p>
              </div>
              <div className="settings-row">
                <span className="settings-label">Domyślna wielkość zdjęć</span>
                <label className="menu-wielkosc">
                  <PoleLiczby
                    wartosc={zdjecie}
                    min={ZDJECIE_SZEROKOSC_MIN}
                    max={ZDJECIE_SZEROKOSC_MAX}
                    tytul={`Największa szerokość zdjęcia, od ${ZDJECIE_SZEROKOSC_MIN} do ${ZDJECIE_SZEROKOSC_MAX}% kolumny`}
                    onZmien={setZdjecieSzerokosc}
                  />
                  <span>% kolumny</span>
                </label>
                <p className="settings-hint">Dotyczy zdjęć bez własnego rozmiaru. Własny ustawisz po kliknięciu w zdjęcie.</p>
              </div>
              <div className="settings-row">
                <span className="settings-label">Odstęp wzorów wystawionych ($$)</span>
                {choice(
                  MATH_GAP_OPTIONS.map((o) => o.value),
                  mGap,
                  setMathGap,
                  (v) => MATH_GAP_OPTIONS.find((o) => o.value === v)?.label ?? '',
                )}
              </div>
              <p className="settings-hint">To samo jest pod przyciskiem ↕ na pasku edytora.</p>
            </>
          )}

          {section === 'typy' && (
            <>
              <div className="settings-row">
                <span className="settings-label">Typy kafelków</span>
                <TypeEditor />
                <p className="settings-hint">Typy jadą razem z kopią zapasową.</p>
                <details className="settings-wiecej">
                  <summary>Co można z nimi zrobić</summary>
                  <p>Każdy da się przemianować, przemalować, schować z listy wyboru i usunąć. Usunięcie pyta, ile kafelków zmieni typ, i przepisuje je na inny — nic nie ginie. Musi zostać przynajmniej jeden typ; skasowany fabryczny wraca przyciskiem „Przywróć fabryczne".</p>
                </details>
              </div>

              <div className="settings-row">
                <span className="settings-label">
                  Nasycenie tła bloków
                  <span className="settings-value">{tint}%</span>
                </span>
                <input
                  className="settings-slider"
                  type="range"
                  min={BLOCK_TINT_MIN}
                  max={BLOCK_TINT_MAX}
                  step={2}
                  value={tint}
                  onChange={(e) => setBlockTint(Number(e.target.value))}
                />
                <p className="settings-hint">Przy 0% zostają same kreski i napisy.</p>
              </div>
            </>
          )}

          {section === 'dane' && (
            <>
              <div className="settings-row">
                <span className="settings-label">Kopia zapasowa</span>
                <div className="settings-backup-actions">
                  <button className="btn" disabled={busy !== null} onClick={handleExport}>
                    {busy === 'export' ? 'Pakuję…' : '⬇ Eksportuj kopię'}
                  </button>
                  <button
                    className="btn"
                    disabled={busy !== null}
                    onClick={() => fileRef.current?.click()}
                  >
                    {busy === 'import' ? 'Wczytuję…' : '⬆ Wczytaj kopię'}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".zip"
                    hidden
                    onChange={(e) => handleImportFile(e.target.files?.[0])}
                  />
                </div>
                {status && <p className="settings-hint settings-status">{status}</p>}
                <p className="settings-hint">
                  Wszystko do jednego pliku <code>.zip</code> — razem z PDF-ami.
                </p>
              </div>

              {/* Telefon dostaje program adresem publicznym, ale notatki idą
                  osobno — do prywatnego repozytorium i tylko stamtąd. */}
              <div className="settings-row">
                <span className="settings-label">Notatki na telefonie</span>
                <div className="settings-telefon">
                  <label className="settings-pole">
                    <span>Repozytorium (prywatne)</span>
                    <input
                      className="input"
                      value={repo}
                      placeholder="Scepeczki/Kompendium"
                      onChange={(e) => setRepo(e.target.value)}
                      onBlur={() => zapiszUstawieniaTelefonu(token, repo)}
                    />
                  </label>
                  {/* Klucz trzeba móc STĄD WYJĄĆ: wpisuje się go na
                      komputerze, a potem jest potrzebny na telefonie. Zakryte
                      pole bez podglądu i kopiowania to ślepy zaułek. */}
                  <label className="settings-pole">
                    <span>Klucz dostępu</span>
                    <div className="settings-klucz">
                      <input
                        className="input"
                        type={pokazKlucz ? 'text' : 'password'}
                        value={token}
                        placeholder="github_pat_…"
                        onChange={(e) => setToken(e.target.value)}
                        onBlur={() => zapiszUstawieniaTelefonu(token, repo)}
                      />
                      <button
                        className="btn"
                        type="button"
                        title={pokazKlucz ? 'Zakryj klucz' : 'Pokaż klucz'}
                        onClick={() => setPokazKlucz((p) => !p)}
                      >
                        {pokazKlucz ? '🙈' : '👁'}
                      </button>
                      <button
                        className="btn"
                        type="button"
                        title="Skopiuj klucz do schowka"
                        disabled={!token}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(token)
                            setStatusTel('Klucz skopiowany — wklej go na telefonie.')
                          } catch {
                            setPokazKlucz(true)
                            setStatusTel('Nie udało się skopiować — klucz jest odkryty, zaznacz i skopiuj ręcznie.')
                          }
                        }}
                      >
                        ⧉
                      </button>
                      <button
                        className="btn"
                        type="button"
                        title="Sprawdź, co ten klucz widzi"
                        disabled={busy !== null}
                        onClick={async () => {
                          zapiszUstawieniaTelefonu(token, repo)
                          setBusy('sprawdzam')
                          setStatusTel('Sprawdzam klucz…')
                          try {
                            setStatusTel(await sprawdzKlucz())
                          } finally {
                            setBusy(null)
                          }
                        }}
                      >
                        Sprawdź
                      </button>
                    </div>
                  </label>
                </div>
                {/* Dwie drogi, każda podpisana jednym słowem — bez tego wygląda
                    to jak cztery przyciski robiące cztery różne rzeczy. */}
                <div className="settings-droga">
                  <span className="settings-droga-nazwa">przez GitHub</span>
                  <div className="settings-backup-actions">
                    <button className="btn" disabled={busy !== null} onClick={handleWyslij}>
                      {busy === 'wyslij' ? 'Wysyłam…' : '⇧ Wyślij notatki (z komputera)'}
                    </button>
                    <button className="btn" disabled={busy !== null} onClick={handlePobierz}>
                      {busy === 'pobierz' ? 'Pobieram…' : '⇩ Pobierz notatki (na telefonie)'}
                    </button>
                  </div>
                </div>
                {/* Druga droga, bez GitHuba: ta sama migawka, tylko plikiem.
                    Działa, gdy nie ma internetu albo gdy nie chce się nikomu
                    powierzać notatek. */}
                <div className="settings-droga">
                  <span className="settings-droga-nazwa">plikiem, bez internetu</span>
                  <div className="settings-backup-actions">
                    <button className="btn" disabled={busy !== null} onClick={handleMigawkaPlik}>
                      {busy === 'plik-zapis' ? 'Zapisuję…' : '⬇ Migawka do pliku'}
                    </button>
                    <button
                      className="btn"
                      disabled={busy !== null}
                      onClick={() => migRef.current?.click()}
                    >
                      {busy === 'plik-czyt' ? 'Wczytuję…' : '⬆ Migawka z pliku'}
                    </button>
                    <input
                      ref={migRef}
                      type="file"
                      accept=".json,application/json"
                      hidden
                      onChange={(e) => handleMigawkaZPliku(e.target.files?.[0])}
                    />
                  </div>
                </div>
                {statusTel && <p className="settings-hint settings-status">{statusTel}</p>}
                <p className="settings-hint">
                  Komputer wysyła, telefon pobiera. Pobranie nigdy nie kasuje.
                  {ostatnioWyslano() && (
                    <span className="settings-kiedy">
                      wysłane {new Date(ostatnioWyslano()).toLocaleString('pl')}
                    </span>
                  )}
                  {ostatnioPobrano() && (
                    <span className="settings-kiedy">
                      pobrane {new Date(ostatnioPobrano()).toLocaleString('pl')}
                    </span>
                  )}
                </p>
                {/* Szczegóły są potrzebne raz — przy pierwszym ustawianiu. Na
                    co dzień tylko zasłaniają przyciski, więc chowamy je pod
                    rozwinięciem zamiast walić nimi po oczach. */}
                <details className="settings-wiecej">
                  <summary>Jak to działa i co jest bezpieczne</summary>
                  <p>
                    Migawka jest kurierem, nie kopią zapasową — nawet gdyby ją zepsuć,
                    dane na komputerze zostają nietknięte. Pobranie nadpisuje to, co ma
                    to samo id, i dokłada nowe; czego w migawce nie ma, to na telefonie
                    zostaje. PDF-y nie jadą, bo ważą setki razy więcej niż cała reszta.
                  </p>
                  <p>
                    Dolna para przycisków robi to samo <strong>plikiem</strong> — bez
                    GitHuba i bez internetu. Zapisujesz plik, przenosisz na telefon
                    (kablem, Bluetoothem, czymkolwiek) i tam wczytujesz.
                  </p>
                </details>
              </div>

              <div className="settings-row">
                <span className="settings-label">Gdzie są moje dane</span>
                <p className="settings-hint">
                  Lokalnie w tej przeglądarce — nic nie wychodzi na zewnątrz samo
                  z siebie.
                </p>
                <details className="settings-wiecej">
                  <summary>Dlaczego telefon pokazuje pustą listę</summary>
                  <p>
                    Baza <code>kompendium</code> (IndexedDB) należy do przeglądarki
                    tego urządzenia. Inne urządzenie ma własną, pustą — to nie jest
                    utrata danych. Notatki przenosi się stąd: kopią zapasową albo
                    wysłaniem powyżej.
                  </p>
                </details>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
