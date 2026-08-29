import { zaznaczenieNaZrodlo, zrodloZDrzewa } from './markdown'

/** Element, w którym siedzi dany punkt zaznaczenia. */
const elementem = (n: Node | null): Element | null =>
  n instanceof Element ? n : (n?.parentElement ?? null)

/** Czy punkt leży w polu do pisania (ProseMirror albo CodeMirror). */
const wPolu = (n: Node | null): boolean =>
  !!elementem(n)?.closest('[contenteditable="true"], .cm-content')

/** Ctrl+C ma dawać ŹRÓDŁO, a nie to, co widać na ekranie.
 *
 *  Bez tego kopiowanie wzorów dawało bełkot: KaTeX trzyma jeden wzór w drzewie
 *  strony trzy razy naraz — glify do patrzenia, MathML dla czytników ekranu
 *  i sam TeX w środku — więc przeglądarka skleja wszystkie trzy w jeden ciąg.
 *
 *  Zasada jest jedna i obowiązuje WSZĘDZIE, gdzie wzór jest wyrenderowany:
 *  podgląd materiału, treść w ścieżce, Skrypt, podgląd w edytorze kafelka.
 *  Nie pytamy, w którym to widoku — pytamy, czy w zaznaczeniu jest wzór.
 *
 *  Jedyny wyjątek to POLA DO PISANIA: tam tekst już jest źródłem, a
 *  kopiowaniem rządzi sam edytor. Wtrącanie się psułoby wklejanie w obrębie
 *  edytora (formatowanie, listy, wcięcia). */
export function wlaczKopiowanieZrodla(): void {
  document.addEventListener('copy', (e) => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const zakres = sel.getRangeAt(0)

    // W polu do pisania nie ruszamy niczego — chyba że zaznaczenie WYCHODZI
    // poza nie; wtedy edytor i tak nie obsłuży kopiowania i zostaje bełkot.
    const startWPolu = wPolu(zakres.startContainer)
    const koniecWPolu = wPolu(zakres.endContainer)
    if (startWPolu && koniecWPolu) return

    // Znamy źródło blok po bloku? (podgląd materiału ma je w `data-md`)
    //
    // Szukamy pieszo, a nie przez `closest('.markdown-body:has(…)')`:
    // złożony selektor w `closest` bywa odrzucany i wysypuje CAŁY nasłuch,
    // przez co kopiowanie po cichu wracało do bełkotu.
    let szukany: Element | null = elementem(zakres.commonAncestorContainer)
    let zBlokami: Element | null = null
    while (szukany) {
      if (szukany.classList.contains('markdown-body') && szukany.querySelector('[data-md]')) {
        zBlokami = szukany
        break
      }
      szukany = szukany.parentElement
    }

    const zrodlo = zBlokami
      ? zaznaczenieNaZrodlo(zakres, zBlokami)
      : zrodloZDrzewa(zakres)
    if (!zrodlo.trim()) return

    // Wtrącamy się TYLKO wtedy, gdy naprawdę mamy co poprawić: albo w
    // zaznaczeniu jest wzór, albo znamy źródło bloków (wracają wtedy również
    // pogrubienia i listy). Inaczej zwykłe kopiowanie ma zostać zwykłe.
    const jestWzor = !!zakres.cloneContents().querySelector('.katex')
    if (!jestWzor && !zBlokami) return

    e.clipboardData?.setData('text/plain', zrodlo)
    e.preventDefault()
  })
}
