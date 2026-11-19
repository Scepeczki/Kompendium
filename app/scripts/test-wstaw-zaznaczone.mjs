// Kopiowanie z podglądu materiału ma dawać ŹRÓDŁO, a nie to, co widać.
//
// KaTeX trzyma jeden wzór w drzewie strony trzy razy naraz (glify do
// patrzenia, MathML dla czytników ekranu i sam TeX w środku), więc zwykłe
// czytanie zaznaczenia sklejało wszystkie trzy w jeden bełkot.
//
// Sprawdzamy obie drogi: zwykłe Ctrl+C i przycisk „Wstaw zaznaczone" —
// przy zaznaczeniu całych bloków i przy takim napoczętym od środka zdania.
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

const WZOR_1 = '$z \\in y_1$'
const WZOR_2 = '$z \\in y_2$'
const WZOR_BLOK = '$$\\forall x \\exists y (z \\in y \\leftrightarrow \\exists t (t \\in x))$$'
const ZRODLO = [
  'Pierwszy akapit **z pogrubieniem** przed wzorem.',
  '',
  `Wzor w linii ${WZOR_1} oraz drugi ${WZOR_2} w tym samym zdaniu.`,
  '',
  WZOR_BLOK,
  '',
  'Ostatni akapit po wzorze.',
].join('\n')

/** Backslashe wpisywane klawiaturą Playwrighta giną — wkładamy wprost. */
const zrob = async (nazwa, tekst) => {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', nazwa)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.evaluate((t) => document.execCommand('insertText', false, t), tekst)
  await page.waitForTimeout(600)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}
await zrob('Aksjomat sumy', ZRODLO)
await zrob('Notatka', 'Cos zupelnie innego.')

await nowaSciezka(page, 'Kopiowanie')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Aksjomat sumy', 'Notatka']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(450)
}
await page.hover('.linear-seg:first-child')
await page.click('.linear-seg:first-child .folder-action[title*="Scal z następnym"]')
await page.waitForSelector('.komp-okno')
await page.waitForTimeout(700)

// podgląd „Treść" kafelka z wzorami — zostaje otwarty do końca testu
await page.locator('.komp-strona-nazwa').first().click()
await page.waitForSelector('.komp-podglad')
await page.waitForTimeout(500)

/** Zaznacza w podglądzie od jednego napisu do drugiego. */
const zaznacz = async (od, doo) =>
  page.evaluate(
    ({ a, b }) => {
      const pod = document.querySelector('.komp-podglad')
      const znajdz = (szukany) => {
        const chodzik = document.createTreeWalker(pod, NodeFilter.SHOW_TEXT)
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
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
    },
    { a: od, b: doo },
  )

const zeSchowka = async () => {
  await page.keyboard.press('Control+c')
  await page.waitForTimeout(400)
  return page.evaluate(() => navigator.clipboard.readText())
}

const trescBloku = () =>
  page.evaluate(async () => {
    const req = indexedDB.open('kompendium')
    const db = await new Promise((res) => {
      req.onsuccess = () => res(req.result)
    })
    const paths = await new Promise((res) => {
      const r = db.transaction('paths').objectStore('paths').getAll()
      r.onsuccess = () => res(r.result)
    })
    return paths[0].nodes.find((n) => n.kind === 'fusion')?.content ?? ''
  })

/** Ten sam wzór dwa razy w wyniku = sklejka glifów z TeX-em. */
const potrojony = (t) => /z∈y1[\s\S]*z∈y1/.test(t) || /∀x[\s\S]*∀x/.test(t)

// 1. podgląd renderuje wzory, a każdy blok niesie swoje źródło
check('podgląd renderuje wzory', (await page.locator('.komp-podglad .katex').count()) > 0)
check(
  'a każdy blok niesie swoje źródło',
  (await page.locator('.komp-podglad [data-md]').count()) === 4,
  `bloków: ${await page.locator('.komp-podglad [data-md]').count()}`,
)

// 2. Ctrl+C przy zaznaczeniu CAŁYCH bloków
await zaznacz('Pierwszy akapit', 'Ostatni akapit po wzorze.')
const caleCtrlC = await zeSchowka()
check('Ctrl+C: wzory w linii wracają jako źródło',
  caleCtrlC.includes(WZOR_1) && caleCtrlC.includes(WZOR_2), caleCtrlC.slice(0, 140))
check('Ctrl+C: wzór blokowy wraca jako źródło',
  caleCtrlC.includes('$$\\forall x'), caleCtrlC.slice(0, 200))
check('Ctrl+C: pogrubienie przeżywa kopiowanie',
  caleCtrlC.includes('**z pogrubieniem**'), caleCtrlC.slice(0, 80))
check('Ctrl+C: żaden wzór nie jest potrojony', !potrojony(caleCtrlC), caleCtrlC.slice(0, 200))

// 3. Ctrl+C przy zaznaczeniu NAPOCZĘTYM — tak zaznacza człowiek
// pogrubienie jest osobnym elementem, więc kotwiczymy w tekście przed nim
await zaznacz('akapit ', 'Ostatni akapit')
const czescCtrlC = await zeSchowka()
check('Ctrl+C od środka zdania: nie bierze tego, co przed zaznaczeniem',
  !czescCtrlC.startsWith('Pierwszy'), czescCtrlC.slice(0, 60))
check('Ctrl+C od środka zdania: wzory i tak wracają jako źródło',
  czescCtrlC.includes(WZOR_1) && czescCtrlC.includes('$$\\forall x'),
  czescCtrlC.slice(0, 200))
check('Ctrl+C od środka zdania: nic nie jest potrojone', !potrojony(czescCtrlC),
  czescCtrlC.slice(0, 200))

// 4. przycisk „Wstaw zaznaczone" — ta sama droga, prosto do kafelka
await zaznacz('Wzor w linii', 'Ostatni akapit po wzorze.')
await page.click('.komp-podglad button:has-text("Wstaw zaznaczone")')
await page.waitForTimeout(1200)
const wBloku = await trescBloku()
check('„Wstaw zaznaczone": wzory zapisane jako źródło',
  wBloku.includes(WZOR_1) && wBloku.includes('$$\\forall x'), wBloku.slice(0, 200))
check('„Wstaw zaznaczone": nic nie jest potrojone', !potrojony(wBloku), wBloku.slice(0, 200))
check('nowe scalenie startuje od pustego kafelka — jest tylko to, co wzięte',
  !wBloku.includes('Cos zupelnie innego') && !wBloku.includes('Pierwszy akapit'),
  wBloku.slice(0, 120))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
