import { useEffect, useRef, useState } from 'react'
import { Icon, PICK_GROUPS, isIconName, type IconName } from './Icon'

/** Barwy znaczka. Te same, którymi malowane są typy klocków, plus akcent
 *  i szarość — żeby drzewo nie zaczęło świecić przypadkowymi kolorami. */
const BARWY: { hex: string; nazwa: string }[] = [
  { hex: '#31619e', nazwa: 'Niebieski' },
  { hex: '#6d4a9e', nazwa: 'Fioletowy' },
  { hex: '#b05575', nazwa: 'Różowy' },
  { hex: '#a8452f', nazwa: 'Ceglany' },
  { hex: '#a9742c', nazwa: 'Miodowy' },
  { hex: '#3d7a52', nazwa: 'Zielony' },
  { hex: '#3d6b54', nazwa: 'Akcent' },
  { hex: '#6b6b66', nazwa: 'Szary' },
]

interface Props {
  /** Nagłówek okienka, np. „Kafelek". */
  title: string
  name: string
  /** Zapisany znaczek — pusty znaczy „zostaw domyślny". */
  icon?: string
  /** Barwa znaczka — pusta znaczy „zostaw domyślną". */
  iconColor?: string
  /** Własna plakietka: do trzech znaków na barwnym tle. */
  iconText?: string
  /** Znaczek pokazywany, gdy własnego nie wybrano (rola rzeczy w drzewie). */
  fallbackIcon: IconName
  /** Plakietka rodzaju (DEF, TW…) — to ona stoi w drzewie, gdy kafelek nie
   *  ma własnego znaczka. Okienko ma pokazywać stan faktyczny, a nie
   *  zastępczą kartkę. */
  plakietka?: { skrot: string; kolor: string }
  /** Podpowiedź w pustym polu. */
  placeholder?: string
  onSave: (
    name: string,
    icon: string | undefined,
    iconColor: string | undefined,
    iconText: string | undefined,
  ) => void
  onClose: () => void
}

/** Zamiana koloru na składowe HSL — do suwaków własnej barwy. */
function hexNaHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / d + 2) * 60
        : ((r - g) / d + 4) * 60
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function hslNaHex(h: number, s: number, l: number): string {
  const sn = s / 100
  const ln = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) =>
    Math.round(255 * (ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))))
  const dwie = (v: number) => v.toString(16).padStart(2, '0')
  return `#${dwie(f(0))}${dwie(f(8))}${dwie(f(4))}`
}

/** Okienko nazwy — zamiast systemowego `prompt`, który nie umie nic poza
 *  jedną linijką tekstu. Tu obok nazwy siedzi znaczek: klika się w niego
 *  i wybiera z siatki. Enter zapisuje, Escape zamyka bez zapisu. */
export function NameDialog({
  title,
  name,
  icon,
  iconColor,
  iconText,
  fallbackIcon,
  plakietka,
  placeholder,
  onSave,
  onClose,
}: Props) {
  const [draft, setDraft] = useState(name)
  const [pick, setPick] = useState<string | undefined>(icon)
  const [barwa, setBarwa] = useState<string | undefined>(iconColor)
  /** Własne litery na plakietce — do trzech znaków. */
  const [litery, setLitery] = useState(iconText ?? '')
  const [picking, setPicking] = useState(false)
  /** Otwarty wybór własnej barwy (suwaki) — poza gotowymi kolorami. */
  const [wlasnaOtwarta, setWlasnaOtwarta] = useState(false)
  /** Pokazywana grupa znaczków — zaczynamy od tej, w której siedzi obecny. */
  const [grupa, setGrupa] = useState(
    () =>
      PICK_GROUPS.find((g) => g.names.some((n) => n === icon))?.label ??
      PICK_GROUPS[0].label,
  )
  const startowe = hexNaHsl(iconColor ?? '') ?? { h: 210, s: 50, l: 40 }
  const [hsl, setHsl] = useState(startowe)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Escape najpierw zamyka siatkę znaczków, dopiero potem całe okienko
      if (picking) setPicking(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picking, onClose])

  const wlasneLitery = litery.trim()

  const zapisz = () => {
    const czysta = draft.trim()
    if (!czysta) return
    onSave(
      czysta,
      wlasneLitery ? undefined : isIconName(pick) ? pick : undefined,
      barwa,
      wlasneLitery || undefined,
    )
    onClose()
  }

  const pokazywany = isIconName(pick) ? pick : fallbackIcon
  /** Czy w drzewie stoi teraz plakietka rodzaju, a nie znaczek. */
  const naPlakietce = !wlasneLitery && !isIconName(pick) && !!plakietka

  /** Znaczek dokładnie taki, jaki widać w drzewie. */
  const podglad = (rozmiar: number) =>
    wlasneLitery ? (
      <span
        className="type-mini"
        style={{ '--block-color': barwa ?? plakietka?.kolor } as React.CSSProperties}
      >
        {wlasneLitery}
      </span>
    ) : naPlakietce ? (
      <span
        className="type-mini"
        style={{ '--block-color': barwa ?? plakietka!.kolor } as React.CSSProperties}
      >
        {plakietka!.skrot}
      </span>
    ) : (
      <Icon name={pokazywany} size={rozmiar} />
    )

  const ustawWlasna = (nowe: { h: number; s: number; l: number }) => {
    setHsl(nowe)
    setBarwa(hslNaHex(nowe.h, nowe.s, nowe.l))
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal name-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <header className="name-dialog-head">
          <h3>{title}</h3>
        </header>

        <div className="name-dialog-row">
          <button
            className={`name-dialog-icon ${pick ? 'wybrany' : ''}`}
            title="Wybierz znaczek i jego barwę"
            style={barwa && !naPlakietce ? { color: barwa } : undefined}
            onClick={() => setPicking((o) => !o)}
          >
            {podglad(1.25)}
          </button>
          <input
            ref={inputRef}
            className="input name-dialog-input"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') zapisz()
            }}
          />
        </div>

        {picking && (
          <div className="icon-picker">
            {/* Domyślny znaczek pokazujemy takim, jaki naprawdę stoi w drzewie:
                dla kafelka to plakietka rodzaju, dla folderu i ścieżki — ich
                własny znaczek. */}
            {/* Własne litery: trzy znaki na barwnym tle. Bywa, że żaden
                gotowy znaczek nie pasuje, a skrót w rodzaju „ZFC" mówi
                wszystko na jeden rzut oka. */}
            <label className="wlasne-litery">
              <span
                className="type-mini"
                style={
                  { '--block-color': barwa ?? plakietka?.kolor ?? '#8d8677' } as React.CSSProperties
                }
              >
                {wlasneLitery || '···'}
              </span>
              <input
                className="input"
                value={litery}
                maxLength={3}
                placeholder="Własne litery (do trzech)"
                spellCheck={false}
                onChange={(e) => {
                  setLitery(e.target.value)
                  if (e.target.value.trim()) setPick(undefined)
                }}
              />
            </label>

            <button
              className={`icon-picker-clear ${pick || wlasneLitery ? '' : 'active'}`}
              onClick={() => {
                setPick(undefined)
                setLitery('')
                setPicking(false)
              }}
            >
              {plakietka ? (
                <span
                  className="type-mini"
                  style={{ '--block-color': barwa ?? plakietka.kolor } as React.CSSProperties}
                >
                  {plakietka.skrot}
                </span>
              ) : (
                <Icon name={fallbackIcon} size={1} />
              )}
              {plakietka ? 'Plakietka rodzaju' : 'Bez własnego znaczka'}
            </button>

            {/* barwa osobno: dotyczy też domyślnego znaczka, więc siedzi
                nad siatką, a nie w niej */}
            <div className="icon-picker-group">
              <div className="icon-picker-colors">
                <button
                  className={`icon-picker-color domyslna ${barwa ? '' : 'active'}`}
                  title="Domyślna (kolor rodzaju)"
                  onClick={() => {
                    setBarwa(undefined)
                    setWlasnaOtwarta(false)
                  }}
                />
                {BARWY.map((b) => (
                  <button
                    key={b.hex}
                    className={`icon-picker-color ${barwa === b.hex ? 'active' : ''}`}
                    style={{ background: b.hex }}
                    title={b.nazwa}
                    onClick={() => {
                      setBarwa(b.hex)
                      setWlasnaOtwarta(false)
                    }}
                  />
                ))}
                <button
                  className={`icon-picker-color wlasna ${
                    barwa && !BARWY.some((b) => b.hex === barwa) ? 'active' : ''
                  }`}
                  style={barwa ? { background: barwa } : undefined}
                  title="Własna barwa"
                  onClick={() => {
                    setWlasnaOtwarta((o) => !o)
                    if (!barwa) ustawWlasna(hsl)
                  }}
                >
                  +
                </button>
              </div>

              {wlasnaOtwarta && (
                <div className="barwa-wlasna">
                  <span className="barwa-probka" style={{ background: barwa }} />
                  <div className="barwa-suwaki">
                    <input
                      type="range"
                      title="Odcień"
                      min={0}
                      max={360}
                      value={hsl.h}
                      style={{
                        background:
                          'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
                      }}
                      onChange={(e) => ustawWlasna({ ...hsl, h: Number(e.target.value) })}
                    />
                    <input
                      type="range"
                      title="Nasycenie"
                      min={0}
                      max={100}
                      value={hsl.s}
                      style={{
                        background: `linear-gradient(to right, hsl(${hsl.h} 0% ${hsl.l}%), hsl(${hsl.h} 100% ${hsl.l}%))`,
                      }}
                      onChange={(e) => ustawWlasna({ ...hsl, s: Number(e.target.value) })}
                    />
                    <input
                      type="range"
                      title="Jasność"
                      min={10}
                      max={80}
                      value={hsl.l}
                      style={{
                        background: `linear-gradient(to right, hsl(${hsl.h} ${hsl.s}% 12%), hsl(${hsl.h} ${hsl.s}% 50%), hsl(${hsl.h} ${hsl.s}% 78%))`,
                      }}
                      onChange={(e) => ustawWlasna({ ...hsl, l: Number(e.target.value) })}
                    />
                  </div>
                  <input
                    className="input barwa-kod"
                    value={barwa ?? ''}
                    spellCheck={false}
                    title="Kod barwy"
                    onChange={(e) => {
                      const v = e.target.value.trim()
                      setBarwa(v)
                      const h = hexNaHsl(v)
                      if (h) setHsl(h)
                    }}
                  />
                </div>
              )}
            </div>
            {/* Znaczki po jednej grupie naraz. Wszystkie sześć wysypanych pod
                sobą zajmowało pół ekranu, a i tak wybiera się jeden. */}
            <div className="icon-picker-zakladki">
              {PICK_GROUPS.map((g) => (
                <button
                  key={g.label}
                  className={`icon-picker-zakladka ${grupa === g.label ? 'active' : ''}`}
                  onClick={() => setGrupa(g.label)}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="icon-picker-grid">
              {(PICK_GROUPS.find((g) => g.label === grupa) ?? PICK_GROUPS[0]).names.map(
                (n) => (
                  <button
                    key={n}
                    className={`icon-picker-btn ${pick === n ? 'active' : ''}`}
                    title={n}
                    style={barwa ? { color: barwa } : undefined}
                    onClick={() => {
                      setPick(n)
                      // znaczek i własne litery wykluczają się — jedno miejsce
                      setLitery('')
                      setPicking(false)
                    }}
                  >
                    <Icon name={n} size={1.15} />
                  </button>
                ),
              )}
            </div>
          </div>
        )}

        <footer className="name-dialog-foot">
          <button className="btn" onClick={onClose}>
            Anuluj
          </button>
          <button className="btn btn-primary" disabled={!draft.trim()} onClick={zapisz}>
            Zapisz
          </button>
        </footer>
      </div>
    </div>
  )
}
