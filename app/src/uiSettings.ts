/** Globalne ustawienia wyglądu tekstu — zmienne CSS + localStorage.
 *  Każda zmiana wysyła zdarzenie 'komp:ui', dzięki czemu otwarte kontrolki
 *  (linijka nad edytorem, suwak w Ustawieniach) trzymają się w synchronizacji. */

export const PAGE_WIDTH_DEFAULT = 800
export const PAGE_WIDTH_MIN = 560
export const PAGE_WIDTH_MAX = 1400

export const IND_OFFSET_DEFAULT = 14
export const IND_OFFSET_MIN = 0
export const IND_OFFSET_MAX = 40

export const LINE_SPACING_DEFAULT = 1.65
export const LINE_SPACING_OPTIONS = [1.0, 1.15, 1.3, 1.5, 1.65, 2.0]

export const PARA_SPACING_DEFAULT = 1
export const PARA_SPACING_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Brak' },
  { value: 0.4, label: 'Mały' },
  { value: 1, label: 'Zwykły' },
  { value: 1.6, label: 'Duży' },
  { value: 2.4, label: 'Bardzo duży' },
]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const notify = () => window.dispatchEvent(new Event('komp:ui'))

export function getPageWidth(): number {
  const w = Number(localStorage.getItem('ui.pageWidth'))
  return w >= PAGE_WIDTH_MIN && w <= PAGE_WIDTH_MAX ? w : getPageWidthDefault()
}

/** Bazowa (domyślna) szerokość strony — to do niej wraca dwuklik trójkącika
 *  i ją pokazują kreseczki na linijce. */
export function getPageWidthDefault(): number {
  const w = Number(localStorage.getItem('ui.pageWidthDefault'))
  return w >= PAGE_WIDTH_MIN && w <= PAGE_WIDTH_MAX ? w : PAGE_WIDTH_DEFAULT
}

export function setPageWidthDefault(w: number): void {
  const v = clamp(Math.round(w), PAGE_WIDTH_MIN, PAGE_WIDTH_MAX)
  localStorage.setItem('ui.pageWidthDefault', String(v))
  notify()
}

/** Bazowe odsunięcie niebieskich znaczników wcięć od zielonego trójkącika. */
export function getIndOffset(): number {
  const v = Number(localStorage.getItem('ui.indOffset'))
  return Number.isFinite(v) &&
    localStorage.getItem('ui.indOffset') !== null &&
    v >= IND_OFFSET_MIN &&
    v <= IND_OFFSET_MAX
    ? v
    : IND_OFFSET_DEFAULT
}

export function setIndOffset(v: number): void {
  const val = clamp(Math.round(v), IND_OFFSET_MIN, IND_OFFSET_MAX)
  // to jest zarazem margines tekstu wewnątrz kartki: niebieskie znaczniki
  // na linijce stoją dokładnie tam, gdzie zaczyna się tekst
  document.documentElement.style.setProperty('--text-pad', `${val}px`)
  localStorage.setItem('ui.indOffset', String(val))
  notify()
}

export function setPageWidth(w: number): void {
  const v = clamp(Math.round(w), PAGE_WIDTH_MIN, PAGE_WIDTH_MAX)
  document.documentElement.style.setProperty('--page-width', `${v}px`)
  localStorage.setItem('ui.pageWidth', String(v))
  notify()
}

export function getLineSpacing(): number {
  const v = Number(localStorage.getItem('ui.lineSpacing'))
  return LINE_SPACING_OPTIONS.includes(v) ? v : LINE_SPACING_DEFAULT
}

export function setLineSpacing(v: number): void {
  document.documentElement.style.setProperty('--content-line', String(v))
  localStorage.setItem('ui.lineSpacing', String(v))
  notify()
}

export function getParaSpacing(): number {
  const v = Number(localStorage.getItem('ui.paraSpacing'))
  return PARA_SPACING_OPTIONS.some((o) => o.value === v) ? v : PARA_SPACING_DEFAULT
}

export function setParaSpacing(v: number): void {
  document.documentElement.style.setProperty('--content-para', `${v}em`)
  localStorage.setItem('ui.paraSpacing', String(v))
  notify()
}

/** Wywoływane raz przy starcie aplikacji — nakłada zapamiętane wartości. */
export function initUiSettings(): void {
  document.documentElement.style.setProperty('--page-width', `${getPageWidth()}px`)
  document.documentElement.style.setProperty('--content-line', String(getLineSpacing()))
  document.documentElement.style.setProperty('--content-para', `${getParaSpacing()}em`)
  document.documentElement.style.setProperty('--text-pad', `${getIndOffset()}px`)
}
