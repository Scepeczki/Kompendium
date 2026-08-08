// Test czterech drobiazgów ze zgłoszenia: nazwa strony przy jednej stronie,
// menu wstawiania między kafelkami w Linii, brak zbędnego znaku przy źródłach
// i strzałki w nagłówku, obejmowanie zaznaczenia dolarami.
import { chromium } from 'playwright'
import { nowaSciezka, podaj } from './lib.mjs'

const problems = []
const errors = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problems.push(nazwa)
}

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// --- 4. dolary obejmują zaznaczenie (tryb kodu) ---
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Kres gorny')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.type('a_n')
await page.keyboard.press('Control+a')
await page.keyboard.type('$')
await page.waitForTimeout(300)
const poJednym = await page.textContent('.editor-code .cm-content')
check('$ przy zaznaczeniu obejmuje tekst, nie zjada go', poJednym.trim() === '$a_n$', poJednym)
await page.keyboard.type('$')
await page.waitForTimeout(300)
const poDwoch = await page.textContent('.editor-code .cm-content')
check('drugie $ robi wzór wystawiony', poDwoch.trim() === '$$a_n$$', poDwoch)

// zaznaczenie zostaje w środku — bez tego drugi dolar nie miałby czego objąć
const zaznaczone = await page.evaluate(() => window.getSelection()?.toString())
check('zaznaczenie zostaje w środku pary', zaznaczone === 'a_n', zaznaczone)

// --- 4b. to samo w edytorze wizualnym ---
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForSelector('.rich-content .tiptap')
await page.click('.rich-content .tiptap')
await page.keyboard.press('Control+a')
await page.keyboard.type('x^2')
await page.keyboard.press('Control+a')
await page.keyboard.type('$')
await page.waitForTimeout(400)
await page.click('.view-switch button:has-text("Kod")')
await page.waitForTimeout(400)
const wizualny = await page.textContent('.editor-code .cm-content')
check('w trybie wizualnym $ też obejmuje zaznaczenie',
  wizualny.includes('$x^2$'), wizualny)

// --- 1. nazwa strony widoczna przy jednej stronie ---
await page.click('.btn-close[title*="Zamknij klocek"]')
await nowaSciezka(page, 'Drobiazgi')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
await page.dragAndDrop('.concept-item:has-text("Kres gorny")', '.linear-append')
await page.waitForTimeout(600)
const nazwaStrony = await page.textContent('.linear-seg .page-chip-static')
check('klocek z jedną stroną pokazuje jej nazwę', nazwaStrony === 'Treść', nazwaStrony)

// --- 3. brak znaku przy źródłach i strzałki w nagłówku ---
check('nagłówek kafelka w Linii bez strzałki ↗',
  (await page.locator('.linear-seg .script-block-open').count()) === 0)
check('nie ma osobnego znaku +/− przy źródłach',
  (await page.locator('.source-list-sign').count()) === 0)

// --- 2. menu wstawiania spod prawego przycisku ---
const seg = await page.locator('.linear-seg').first().boundingBox()
await page.mouse.click(seg.x + seg.width / 2, seg.y + 8, { button: 'right' })
await page.waitForSelector('.linear-menu')
const pozycje = await page.locator('.linear-menu .tree-menu-item').allTextContents()
check('menu ma rozdział, podrozdział, notatkę i komentarz',
  pozycje.length === 4 && pozycje.join('|').includes('Rozdział') &&
    pozycje.join('|').includes('Komentarz'),
  pozycje.map((s) => s.trim()).join(' · '))
check('menu mówi, gdzie wstawi',
  (await page.locator('.linear-menu .tree-menu-where').textContent()).startsWith('przed'),
  await page.locator('.linear-menu .tree-menu-where').textContent())

await page.click('.linear-menu .tree-menu-item:has-text("Rozdział"):not(:has-text("Pod"))')
await podaj(page, 'Rozdzial I')
await page.waitForTimeout(700)
const kolejnosc = await page.evaluate(() =>
  [...document.querySelectorAll('.linear-seg')].map((s) =>
    (s.querySelector('.script-heading-node, .script-block-title')?.textContent ?? '').trim(),
  ),
)
check('rozdział wstawiony PRZED kafelkiem, nie na końcu',
  kolejnosc[0] === 'Rozdzial I' && kolejnosc.length === 2, kolejnosc.join(' | '))

// wstawienie „po" dolną połową segmentu
const seg2 = await page.locator('.linear-seg').last().boundingBox()
await page.mouse.click(seg2.x + seg2.width / 2, seg2.y + seg2.height - 8, { button: 'right' })
await page.waitForSelector('.linear-menu')
check('dolna połowa segmentu wstawia po nim',
  (await page.locator('.linear-menu .tree-menu-where').textContent()).startsWith('po'))
await page.click('.linear-menu .tree-menu-item:has-text("Notatka")')
await page.waitForTimeout(700)
check('notatka doszła na końcu',
  (await page.locator('.linear-seg').count()) === 3,
  `segmentów: ${await page.locator('.linear-seg').count()}`)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
