/** Globalne ustawienia wyglądu tekstu — zmienne CSS + localStorage.
 *  Każda zmiana wysyła zdarzenie 'komp:ui', dzięki czemu otwarte kontrolki
 *  (linijka nad edytorem, suwak w Ustawieniach) trzymają się w synchronizacji. */

/** Nasycenie tła bloków (procenty koloru typu). */
export const BLOCK_TINT_DEFAULT = 14
export const BLOCK_TINT_MIN = 0
export const BLOCK_TINT_MAX = 34

export const PAGE_WIDTH_DEFAULT = 800
export const PAGE_WIDTH_MIN = 560
export const PAGE_WIDTH_MAX = 1400

export const IND_OFFSET_DEFAULT = 14
export const IND_OFFSET_MIN = 0
export const IND_OFFSET_MAX = 40

/** Rozmiar tekstu w liście kafelków i folderów (pasek boczny).
 *  Domyślnie tyle, ile dziedziczy z reszty interfejsu, żeby włączenie
 *  ustawienia niczego nie zmieniało bez wyraźnej decyzji. */
export const TREE_SIZE_DEFAULT = 12
export const TREE_SIZE_MIN = 12
export const TREE_SIZE_MAX = 20

export const LINE_SPACING_DEFAULT = 1.65
export const LINE_SPACING_OPTIONS = [1.0, 1.15, 1.3, 1.5, 1.65, 2.0]

/** Skala wzorów względem tekstu (KaTeX rysuje domyślnie 1,21× — stąd
 *  wrażenie, że wzory są za duże przy zwykłym akapicie). */
export const MATH_SCALE_DEFAULT = 1.0
export const MATH_SCALE_OPTIONS = [0.85, 0.9, 1.0, 1.1, 1.21]

/** Odstęp pionowy wokół wzorów wystawionych ($$…$$), w em. */
export const MATH_GAP_DEFAULT = 0.5
export const MATH_GAP_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Brak' },
  { value: 0.25, label: 'Mały' },
  { value: 0.5, label: 'Zwykły' },
  { value: 1, label: 'Duży' },
  { value: 1.6, label: 'Bardzo duży' },
]

/** Wcięcie list punktowanych i numerowanych, w em.
 *
 *  Przeglądarka domyślnie odsuwa tekst punktu o czterdzieści pikseli od
 *  marginesu — w gęstym tekście matematycznym to przepaść. */
export const LIST_INDENT_DEFAULT = 1.4
export const LIST_INDENT_OPTIONS: { value: number; label: string }[] = [
  { value: 0.9, label: 'Ciasno' },
  { value: 1.4, label: 'Zwykle' },
  { value: 2, label: 'Luźno' },
  { value: 2.6, label: 'Bardzo luźno' },
]

/** Deseń tła — cichy rysunek na marginesach, wokół kartki i pod Skryptem. */
export type BgPattern = 'gladkie' | 'kratka' | 'kropki' | 'ukosne'
export const BG_PATTERN_DEFAULT: BgPattern = 'gladkie'
export const BG_PATTERN_OPTIONS: { value: BgPattern; label: string }[] = [
  { value: 'gladkie', label: 'Gładkie' },
  { value: 'kratka', label: 'Kratka' },
  { value: 'kropki', label: 'Kropki' },
  { value: 'ukosne', label: 'Ukośne' },
]

/** Krój pisma treści kafelków. Interfejs zostaje bezszeryfowy zawsze —
 *  wybór dotyczy tylko powierzchni do czytania (edytor, Skrypt, Linia). */
export type ContentFont = 'bez' | 'szeryf'
export const CONTENT_FONT_DEFAULT: ContentFont = 'bez'
export const CONTENT_FONT_OPTIONS: { value: ContentFont; label: string }[] = [
  { value: 'bez', label: 'Bezszeryfowy' },
  { value: 'szeryf', label: 'Szeryfowy' },
]

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

/** Zapamiętana liczba albo wartość domyślna. Uwaga: `Number(null)` to 0,
 *  więc brak wpisu musi być sprawdzany osobno — inaczej ustawienia, których
 *  listą wyboru jest zero (odstępy), startowałyby wyzerowane. */
const readNum = (key: string, valid: (v: number) => boolean, def: number): number => {
  const raw = localStorage.getItem(key)
  if (raw === null) return def
  const v = Number(raw)
  return Number.isFinite(v) && valid(v) ? v : def
}

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
  return readNum(
    'ui.indOffset',
    (v) => v >= IND_OFFSET_MIN && v <= IND_OFFSET_MAX,
    IND_OFFSET_DEFAULT,
  )
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

export function getMathScale(): number {
  const v = Number(localStorage.getItem('ui.mathScale'))
  return MATH_SCALE_OPTIONS.includes(v) ? v : MATH_SCALE_DEFAULT
}

export function setMathScale(v: number): void {
  document.documentElement.style.setProperty('--math-scale', String(v))
  localStorage.setItem('ui.mathScale', String(v))
  notify()
}

export function getMathGap(): number {
  return readNum(
    'ui.mathGap',
    (v) => MATH_GAP_OPTIONS.some((o) => o.value === v),
    MATH_GAP_DEFAULT,
  )
}

export function setMathGap(v: number): void {
  document.documentElement.style.setProperty('--math-gap', `${v}em`)
  localStorage.setItem('ui.mathGap', String(v))
  notify()
}

export function getListIndent(): number {
  return readNum(
    'ui.listIndent',
    (v) => LIST_INDENT_OPTIONS.some((o) => o.value === v),
    LIST_INDENT_DEFAULT,
  )
}

export function setListIndent(v: number): void {
  document.documentElement.style.setProperty('--list-indent', `${v}em`)
  localStorage.setItem('ui.listIndent', String(v))
  notify()
}

export function getParaSpacing(): number {
  return readNum(
    'ui.paraSpacing',
    (v) => PARA_SPACING_OPTIONS.some((o) => o.value === v),
    PARA_SPACING_DEFAULT,
  )
}

export function setParaSpacing(v: number): void {
  document.documentElement.style.setProperty('--content-para', `${v}em`)
  localStorage.setItem('ui.paraSpacing', String(v))
  notify()
}

export function getContentFont(): ContentFont {
  const v = localStorage.getItem('ui.contentFont')
  return v === 'bez' || v === 'szeryf' ? v : CONTENT_FONT_DEFAULT
}

const setContentFontVar = (v: ContentFont) =>
  document.documentElement.style.setProperty(
    '--font-content',
    v === 'szeryf' ? 'var(--font-read)' : 'var(--font-ui)',
  )

export function setContentFont(v: ContentFont): void {
  setContentFontVar(v)
  localStorage.setItem('ui.contentFont', v)
  notify()
}

export function getBgPattern(): BgPattern {
  const v = localStorage.getItem('ui.bgPattern')
  return BG_PATTERN_OPTIONS.some((o) => o.value === v)
    ? (v as BgPattern)
    : BG_PATTERN_DEFAULT
}

export function setBgPattern(v: BgPattern): void {
  setBgPatternAttr(v)
  localStorage.setItem('ui.bgPattern', v)
  notify()
}

/** Deseń jedzie atrybutem na <html>, bo to zwykły przełącznik wariantu,
 *  a nie liczba — arkusz stylów trzyma wtedy całą definicję u siebie. */
const setBgPatternAttr = (v: BgPattern) => {
  if (v === 'gladkie') delete document.documentElement.dataset.bg
  else document.documentElement.dataset.bg = v
}

export function getTreeSize(): number {
  return readNum(
    'ui.treeSize',
    (v) => v >= TREE_SIZE_MIN && v <= TREE_SIZE_MAX,
    TREE_SIZE_DEFAULT,
  )
}

export function setTreeSize(v: number): void {
  const val = clamp(Math.round(v), TREE_SIZE_MIN, TREE_SIZE_MAX)
  document.documentElement.style.setProperty('--tree-size', `${val}px`)
  localStorage.setItem('ui.treeSize', String(val))
  notify()
}

/** Wielkość nazwy rozdziału w Linii, osobno dla każdego poziomu. Skrypt liczy
 *  swoją z tej samej wartości, żeby jeden suwak rządził oboma widokami. */
export type PoziomRozdzialu = 1 | 2 | 3
export const ROZDZIAL_ROZMIARY: Record<PoziomRozdzialu, number> = { 1: 20, 2: 16, 3: 14 }
export const ROZDZIAL_MIN = 12
export const ROZDZIAL_MAX = 36

export function getRozmiarRozdzialu(poziom: PoziomRozdzialu): number {
  return readNum(
    `ui.rozdzial${poziom}`,
    (v) => v >= ROZDZIAL_MIN && v <= ROZDZIAL_MAX,
    ROZDZIAL_ROZMIARY[poziom],
  )
}

export function setRozmiarRozdzialu(poziom: PoziomRozdzialu, v: number): void {
  const val = clamp(Math.round(v), ROZDZIAL_MIN, ROZDZIAL_MAX)
  document.documentElement.style.setProperty(`--rozdzial-${poziom}`, `${val}px`)
  localStorage.setItem(`ui.rozdzial${poziom}`, String(val))
  notify()
}

/** Wielkość tekstu w kafelkach. Skrypt i telefon dokładają do niej swoje 2 px. */
export const TEKST_KAFELKA_DEFAULT = 13
export const TEKST_KAFELKA_MIN = 11
export const TEKST_KAFELKA_MAX = 20

export function getTekstKafelka(): number {
  return readNum(
    'ui.tekstKafelka',
    (v) => v >= TEKST_KAFELKA_MIN && v <= TEKST_KAFELKA_MAX,
    TEKST_KAFELKA_DEFAULT,
  )
}

export function setTekstKafelka(v: number): void {
  const val = clamp(Math.round(v), TEKST_KAFELKA_MIN, TEKST_KAFELKA_MAX)
  document.documentElement.style.setProperty('--tekst-kafelka', `${val}px`)
  localStorage.setItem('ui.tekstKafelka', String(val))
  notify()
}

export function getBlockTint(): number {
  return readNum(
    'ui.blockTint',
    (v) => v >= BLOCK_TINT_MIN && v <= BLOCK_TINT_MAX,
    BLOCK_TINT_DEFAULT,
  )
}

export function setBlockTint(v: number): void {
  const val = clamp(Math.round(v), BLOCK_TINT_MIN, BLOCK_TINT_MAX)
  document.documentElement.style.setProperty('--block-tint', String(val))
  localStorage.setItem('ui.blockTint', String(val))
  notify()
}

/** Wywoływane raz przy starcie aplikacji — nakłada zapamiętane wartości. */
export function initUiSettings(): void {
  // gęstszy układ: dawne szerokości kolumn i rozmiar listy rozjechałyby go,
  // więc raz wracają do nowych domyślnych
  if (!localStorage.getItem('ui.gestyUklad.v1')) {
    localStorage.setItem('ui.gestyUklad.v1', '1')
    for (const k of ['ui.sidebarW', 'ui.outlineWidth', 'ui.treeSize']) localStorage.removeItem(k)
  }
  document.documentElement.style.setProperty('--page-width', `${getPageWidth()}px`)
  document.documentElement.style.setProperty('--content-line', String(getLineSpacing()))
  document.documentElement.style.setProperty('--content-para', `${getParaSpacing()}em`)
  document.documentElement.style.setProperty('--text-pad', `${getIndOffset()}px`)
  document.documentElement.style.setProperty('--math-scale', String(getMathScale()))
  document.documentElement.style.setProperty('--math-gap', `${getMathGap()}em`)
  document.documentElement.style.setProperty('--list-indent', `${getListIndent()}em`)
  document.documentElement.style.setProperty('--block-tint', String(getBlockTint()))
  document.documentElement.style.setProperty('--tree-size', `${getTreeSize()}px`)
  document.documentElement.style.setProperty('--tekst-kafelka', `${getTekstKafelka()}px`)
  for (const p of [1, 2, 3] as const) {
    document.documentElement.style.setProperty(`--rozdzial-${p}`, `${getRozmiarRozdzialu(p)}px`)
  }
  setContentFontVar(getContentFont())
  setBgPatternAttr(getBgPattern())
  // barwy typów przeniosły się do bazy (tabela blockTypes) — nie ma tu już
  // czego nakładać; dawne wpisy ui.color.* przepisała migracja do v7
}
