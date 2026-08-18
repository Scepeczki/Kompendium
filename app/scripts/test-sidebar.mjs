// Test paska bocznego: szukanie i filtr typu schowane pod ikonami,
// rząd tworzenia nad drzewem, dolny pasek z grafem i ustawieniami.
import { chromium } from 'playwright'
import { nowaSciezka } from './lib.mjs'

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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
page.on('dialog', (d) => d.accept('Folder'))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

for (const [n, t] of [
  ['Granica ciagu', 'definicja'],
  ['Twierdzenie o trzech ciagach', 'twierdzenie'],
  ['Przyklad rozbiezny', 'przyklad'],
]) {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.selectOption('.type-select', t)
  await page.waitForTimeout(350)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}
// ścieżka — w filtrze ma własną pozycję, więc musi być co filtrować
await nowaSciezka(page, 'Ścieżka testowa')
await page.waitForTimeout(400)

// 1. na starcie nie ma dużego pola szukania ani listy typów
check('szukanie schowane na starcie',
  (await page.locator('.sidebar-filters input[type=search]').count()) === 0)
check('lista typów schowana na starcie',
  (await page.locator('.sidebar-filter-pop').count()) === 0)

// 2. ikona 🔍 otwiera pole i od razu w nim jesteśmy
await page.click('.sidebar-tool[title*="Szukaj"]')
await page.waitForSelector('.sidebar-filters input[type=search]')
await page.keyboard.type('granic')
await page.waitForTimeout(500)
const found = await page.locator('.concept-item').allTextContents()
check('szukanie filtruje listę', found.length === 1 && found[0].includes('Granica'),
  found.join(' | '))

// 3. Escape czyści i chowa szukanie
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
check('Escape chowa szukanie',
  (await page.locator('.sidebar-filters input[type=search]').count()) === 0)
// trzy kafelki i ścieżka — ścieżki stoją w tej liście na równi z kafelkami
check('po schowaniu widać znów wszystko',
  (await page.locator('.concept-item').count()) === 4,
  `${await page.locator('.concept-item').count()}`)

// 4. ikona filtra otwiera listę typów i wybór zawęża widok
await page.click('.sidebar-tool-wrap .sidebar-tool')
await page.waitForSelector('.sidebar-filter-pop')
const items = await page.locator('.sidebar-filter-item').count()
// „Wszystko" + „Ścieżki" + osiem rodzajów (także schowane z wyboru) + „Gotowe"
check('filtr wymienia wszystkie rodzaje, ścieżki i wyjścia', items === 11,
  `pozycji: ${items}`)
await page.click('.sidebar-filter-item:has-text("Twierdzenie")')
await page.waitForTimeout(400)
check('okienko zostaje otwarte — wybór jest wielokrotny',
  (await page.locator('.sidebar-filter-pop').count()) === 1)
const filtered = await page.locator('.concept-item').allTextContents()
check('filtr rodzaju zawęża listę', filtered.length === 1 && filtered[0].includes('Twierdzenie'),
  filtered.join(' | '))

// 4a. drugi rodzaj dokłada się do pierwszego, a nie go zastępuje
await page.click('.sidebar-filter-item:has-text("Definicja")')
await page.waitForTimeout(400)
const dwa = await page.locator('.concept-item').allTextContents()
check('dwa rodzaje naraz pokazują się razem',
  dwa.length === 2 &&
    dwa.some((t) => t.startsWith('TW')) &&
    dwa.some((t) => t.startsWith('DEF')),
  dwa.join(' | '))
check('ikona filtra liczy wybrane rodzaje',
  (await page.locator('.sidebar-tool-tag').textContent()) === '2')
await page.click('.sidebar-filter-item:has-text("Definicja")')
await page.waitForTimeout(400)
check('ponowny klik odznacza rodzaj',
  (await page.locator('.concept-item').count()) === 1,
  `${await page.locator('.concept-item').count()}`)
await page.click('.sidebar-filter-item:has-text("Gotowe")')
await page.waitForTimeout(300)
check('„Gotowe" zamyka okienko',
  (await page.locator('.sidebar-filter-pop').count()) === 0)

// 5. przy włączonym filtrze ikona pokazuje wybrany typ
const tag = await page.locator('.sidebar-tool-tag').textContent()
check('ikona filtra pokazuje wybrany typ', tag === 'TW', `pokazuje: ${tag}`)

// 6. ścieżki mają w filtrze własną pozycję — są w tej liście na równi
await page.click('.sidebar-tool-wrap .sidebar-tool')
await page.waitForSelector('.sidebar-filter-pop')
await page.click('.sidebar-filter-item:has-text("Ścieżki")')
await page.waitForTimeout(500)
const zeSciezkami = await page.locator('.concept-item').allTextContents()
check('filtr pokazuje twierdzenia razem ze ścieżkami',
  zeSciezkami.some((t) => t.includes('Twierdzenie')) &&
    zeSciezkami.some((t) => t.includes('Ścieżka testowa')),
  zeSciezkami.join(' | '))

// 6a. powrót do „Wszystko"
await page.click('.sidebar-filter-item:has-text("Wszystko")')
await page.waitForTimeout(500)
check('powrót do wszystkiego',
  (await page.locator('.concept-item').count()) === 4 &&
    (await page.locator('.sidebar-tool-tag').count()) === 0,
  `${await page.locator('.concept-item').count()}`)
await page.click('.sidebar-filter-item:has-text("Gotowe")')
await page.waitForTimeout(300)

// 7. rząd tworzenia nad drzewem i dolny pasek
const create = await page.locator('.sidebar-create-btn').allTextContents()
check('rząd tworzenia: kafelek, folder, ścieżka', create.length === 3,
  create.map((s) => s.trim()).join(' · '))
const footer = await page.evaluate(() => ({
  graf: !!document.querySelector('.sidebar-foot-btn[title*="Graf"]'),
  ustawienia: !!document.querySelector('.sidebar-foot-btn[title="Ustawienia"]'),
  licznik: document.querySelector('.sidebar-counts')?.textContent?.trim(),
}))
check('dolny pasek: graf, licznik, ustawienia',
  footer.graf && footer.ustawienia && footer.licznik === '3 · 1',
  JSON.stringify(footer))

// 8. przyciski na dole działają
await page.click('.sidebar-foot-btn[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.click('.settings-page-head button:has-text("Wróć")')
await page.click('.sidebar-foot-btn[title*="Graf"]')
await page.waitForSelector('.graph-view, svg')
check('graf otwiera się z dolnego paska', true)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
