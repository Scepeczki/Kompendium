import { zaznaczenieNaZrodlo, zrodloZDrzewa } from './markdown'

/** Czy zaznaczenie siedzi w tekście DO CZYTANIA (a nie w polu do pisania).
 *
 *  W polu do pisania kopiowaniem rządzi edytor — ma własne reguły i własny
 *  schowek, więc się tam nie wtrącamy. */
function czytany(sel: Selection): Element | null {
  const wezel = sel.anchorNode
  const el = wezel instanceof Element ? wezel : (wezel?.parentElement ?? null)
  if (!el) return null
  if (el.closest('[contenteditable="true"], .tiptap, .cm-content')) return null
  return el.closest('.markdown-body')
}

/** Ctrl+C w wyrenderowanym tekście ma dawać ŹRÓDŁO, a nie to, co widać.
 *
 *  Bez tego kopiowanie wzorów dawało bełkot: KaTeX trzyma jeden wzór w drzewie
 *  strony trzy razy naraz (glify do patrzenia, MathML dla czytników ekranu
 *  i sam TeX w środku), więc przeglądarka skleja wszystkie trzy w jeden ciąg.
 *
 *  Tam, gdzie znamy źródło blok po bloku (podgląd na ekranie komponowania —
 *  atrybuty `data-md`), oddajemy je wprost: wracają wtedy także pogrubienia,
 *  listy i wcięcia. Gdzie go nie znamy — składamy tekst z drzewa, podmieniając
 *  same wzory na ich TeX. */
export function wlaczKopiowanieZrodla(): void {
  document.addEventListener('copy', (e) => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const pojemnik = czytany(sel)
    if (!pojemnik) return
    const zakres = sel.getRangeAt(0)
    const zrodlo = pojemnik.querySelector('[data-md]')
      ? zaznaczenieNaZrodlo(zakres, pojemnik)
      : zrodloZDrzewa(zakres)
    if (!zrodlo.trim()) return
    e.clipboardData?.setData('text/plain', zrodlo)
    e.preventDefault()
  })
}
