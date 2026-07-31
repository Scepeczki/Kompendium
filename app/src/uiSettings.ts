/** Globalne ustawienia wyglądu tekstu — zmienne CSS + localStorage.
 *  Każda zmiana wysyła zdarzenie 'komp:ui', dzięki czemu otwarte kontrolki
 *  (linijka nad edytorem, suwak w Ustawieniach) trzymają się w synchronizacji. */

export const PAGE_WIDTH_DEFAULT = 800
export const PAGE_WIDTH_MIN = 560
export const PAGE_WIDTH_MAX = 1400

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
  return w >= PAGE_WIDTH_MIN && w <= PAGE_WIDTH_MAX ? w : PAGE_WIDTH_DEFAULT
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
}
