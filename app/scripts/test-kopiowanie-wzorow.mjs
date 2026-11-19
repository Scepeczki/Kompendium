// Kopiowanie wzorów ma działać WSZĘDZIE, gdzie wzór jest wyrenderowany.
//
// KaTeX trzyma jeden wzór w drzewie strony trzy razy naraz (glify do
// patrzenia, MathML dla czytników ekranu i sam TeX w środku), więc zwykłe
// kopiowanie sklejało wszystkie trzy: „z∈y1z \in y_1z∈y1​".
//
// Ten test obchodzi po kolei każde miejsce, z którego człowiek kopiuje:
// podgląd materiału, treść w ścieżce, Skrypt, podgląd w edytorze kafelka.
import { chromium } from 'playwright'
import { nowaSciezka } from './lib.mjs'

const problems = []
const errors = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problems.push(nazwa)
}

const browser = await chromium.launch({
  executablePath: process.env.KOMP_PRZEGLADARKA ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})
const kontekst = await browser.newContext({ viewport: { width: 1500, height: 950 } })
await kontekst.grantPermissions(['clipboard-read', 'clipboard-write'])
const page = await kontekst.newPage()
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const W1 = '$y_1$'
const W2 = '$y_2$'
const WB = '$$(\\forall x)(\\exists y)(\\forall z)(z \\in y)$$'
const ZRODLO = [
  `Zalozmy, ze istnieja dwa zbiory ${W1} oraz ${W2}, z ktorych oba spelniaja`,
  'warunek Aksjomatu Sumy (A4). Zgodnie z definicja aksjomatu sumy, dla',
  'kazdego obiektu $z$ zachodza jednoczesnie dwa warunki semantyczne:',
  '',
  WB,
  '',
  'Poniewaz prawe strony obu rownowaznosci sa identycznymi formulami.',
].join('\n')

const zrob = async (nazwa, tekst) => {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', nazwa)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.evaluate((t) => document.execCommand('insertText', false, t), tekst)
  await page.waitForTimeout(600)
}
await zrob('Aksjomat sumy', ZRODLO)

/** Zaznacza w podanym pojemniku od napisu do napisu i kopiuje. */
const skopiuj = async (pojemnik, od, doo) => {
  await page.evaluate(
    ({ sel: selektor, a, b }) => {
      const root = document.querySelector(selektor)
      if (!root) throw new Error('nie ma pojemnika: ' + selektor)
      const znajdz = (szukany) => {
        const chodzik = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        let n
        while ((n = chodzik.nextNode())) {
          const i = n.textContent.indexOf(szukany)
          if (i >= 0) return { node: n, i }
        }
        throw new Error('nie znalazlem: ' + szukany)
      }
      const p = znajdz(a)
      const k = znajdz(b)
      const r = document.createRange()
      r.setStart(p.node, p.i)
      r.setEnd(k.node, k.i + b.length)
      const s = window.getSelection()
      s.removeAllRanges()
      s.addRange(r)
    },
    { sel: pojemnik, a: od, b: doo },
  )
  await page.waitForTimeout(250)
  await page.keyboard.press('Control+c')
  await page.waitForTimeout(400)
  return page.evaluate(() => navigator.clipboard.readText())
}

/** Ten sam wzór dwa razy = sklejka glifów z TeX-em. */
const potrojony = (t) => /y1[\s\S]*y_1[\s\S]*y1/.test(t) || /∀x[\s\S]*forall x[\s\S]*∀x/.test(t)
const dobre = (t) => t.includes(W1) && !potrojony(t)

// --- 1. podgląd w edytorze kafelka (tryb „Podział") ---
await page.click('.view-switch button:has-text("Podział")')
await page.waitForSelector('.editor-preview')
await page.waitForTimeout(600)
const wPodgladzie = await skopiuj(
  '.editor-preview',
  'ze istnieja dwa zbiory',
  'dwa warunki semantyczne:',
)
check('edytor kafelka, podgląd: wzory wracają jako źródło', dobre(wPodgladzie),
  wPodgladzie.slice(0, 150))

await page.click('.btn-close[title*="Zamknij kafelek"]')

// --- ścieżka z tym kafelkiem ---
await nowaSciezka(page, 'Kopiowanie wszedzie')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
await page.dragAndDrop('.concept-item:has-text("Aksjomat sumy")', '.linear-append')
await page.waitForTimeout(700)

// --- 2. Skrypt (czytanie) ---
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-body')
await page.waitForTimeout(700)
const wSkrypcie = await skopiuj(
  '.script-body',
  'ze istnieja dwa zbiory',
  'dwa warunki semantyczne:',
)
check('Skrypt: wzory wracają jako źródło', dobre(wSkrypcie), wSkrypcie.slice(0, 150))

// --- 3. Linia: pole do pisania (tam rządzi edytor — ma dać źródło samo) ---
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-seg')
await page.waitForTimeout(700)
await page.click('.linear-seg .markdown-body, .linear-seg .tiptap')
await page.waitForSelector('.linear-seg .tiptap')
await page.waitForTimeout(600)
const wPolu = await skopiuj('.linear-seg .tiptap', 'ze istnieja dwa zbiory', 'semantyczne:')
check('Linia, pole do pisania: wzory wracają jako źródło', dobre(wPolu), wPolu.slice(0, 150))

// --- 4. podgląd materiału na ekranie komponowania ---
await zrob('Drugi kafelek', 'Cos zupelnie innego.')
await page.click('.btn-close[title*="Zamknij kafelek"]')
await page.click('.concept-item:has-text("Kopiowanie wszedzie")')
await page.waitForSelector('.linear-seg')
await page.waitForTimeout(600)
await page.dragAndDrop('.concept-item:has-text("Drugi kafelek")', '.linear-append')
await page.waitForTimeout(700)
await page.hover('.linear-seg:first-child')
await page.click('.linear-seg:first-child .folder-action[title*="Scal z następnym"]')
await page.waitForSelector('.komp-okno')
await page.waitForTimeout(700)
await page.locator('.komp-strona-nazwa').first().click()
await page.waitForSelector('.komp-podglad')
await page.waitForTimeout(500)

// dokładnie przypadek zgłoszony: koniec zaznaczenia TUŻ PRZED wzorem blokowym
const wMateriale = await skopiuj(
  '.komp-podglad',
  'ze istnieja dwa zbiory',
  'dwa warunki semantyczne:',
)
check('materiał: zaznaczenie kończące się tuż przed wzorem blokowym',
  dobre(wMateriale), wMateriale.slice(0, 150))

// i takie, które zaczyna się TUŻ ZA wzorem w linii
const zaWzorem = await skopiuj('.komp-podglad', ', z ktorych oba', 'semantyczne:')
check('materiał: zaznaczenie zaczynające się tuż za wzorem w linii',
  !potrojony(zaWzorem) && zaWzorem.includes('z ktorych oba'), zaWzorem.slice(0, 150))

// i takie, które kończy się W ŚRODKU wzoru
const wSrodku = await skopiuj('.komp-podglad', 'Zalozmy, ze istnieja', 'y_1')
check('materiał: zaznaczenie kończące się w środku wzoru bierze go w całości',
  wSrodku.includes(W1) && !potrojony(wSrodku), wSrodku.slice(0, 150))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
