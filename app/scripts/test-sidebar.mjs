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

// 1. szukanie stoi na wierzchu, a filtry rodzajów tuż pod nim
check('pole szukania widoczne na starcie',
  await page.isVisible('.sidebar-filters input[type=search]'))
check('filtr ma „Wszystko" i ścieżki',
  (await page.locator('.sidebar-chip:has-text("Wszystko")').count()) === 1 &&
    (await page.locator('.sidebar-chip:has-text("Ścieżki")').count()) === 1)

// 2. pisanie w polu filtruje listę
await page.fill('.sidebar-filters input[type=search]', 'granic')
await page.waitForTimeout(500)
const found = await page.locator('.concept-item').allTextContents()
check('szukanie filtruje listę', found.length === 1 && found[0].includes('Granica'),
  found.join(' | '))

// 3. Escape czyści szukanie
await page.press('.sidebar-filters input[type=search]', 'Escape')
await page.waitForTimeout(400)
check('Escape czyści szukanie',
  (await page.inputValue('.sidebar-filters input[type=search]')) === '')
// trzy kafelki i ścieżka — ścieżki stoją w tej liście na równi z kafelkami
check('po wyczyszczeniu widać znów wszystko',
  (await page.locator('.concept-item').count()) === 4,
  `${await page.locator('.concept-item').count()}`)

// 4. rodzaj z listy zawęża widok; filtry są tylko dla rodzajów, które są na liście
const chipy = await page.locator('.sidebar-chip').allTextContents()
check('filtr wymienia tylko rodzaje z listy', chipy.join(',') === 'Wszystko,DEF,TW,PRZ,Ścieżki',
  chipy.join(','))
await page.click('.sidebar-chip:has-text("TW")')
await page.waitForTimeout(400)
const filtered = await page.locator('.concept-item').allTextContents()
check('filtr rodzaju zawęża listę', filtered.length === 1 && filtered[0].includes('Twierdzenie'),
  filtered.join(' | '))

// 4a. drugi rodzaj dokłada się do pierwszego, a nie go zastępuje
await page.click('.sidebar-chip:has-text("DEF")')
await page.waitForTimeout(400)
const dwa = await page.locator('.concept-item').allTextContents()
check('dwa rodzaje naraz pokazują się razem',
  dwa.length === 2 &&
    dwa.some((t) => t.startsWith('TW')) &&
    dwa.some((t) => t.startsWith('DEF')),
  dwa.join(' | '))
await page.click('.sidebar-chip:has-text("DEF")')
await page.waitForTimeout(400)
check('ponowny klik odznacza rodzaj',
  (await page.locator('.concept-item').count()) === 1,
  `${await page.locator('.concept-item').count()}`)

// 6. ścieżki mają w filtrze własną pozycję — są w tej liście na równi
await page.click('.sidebar-chip:has-text("Ścieżki")')
await page.waitForTimeout(500)
const zeSciezkami = await page.locator('.concept-item').allTextContents()
check('filtr pokazuje twierdzenia razem ze ścieżkami',
  zeSciezkami.some((t) => t.includes('Twierdzenie')) &&
    zeSciezkami.some((t) => t.includes('Ścieżka testowa')),
  zeSciezkami.join(' | '))

// 6a. powrót do „Wszystko"
await page.click('.sidebar-chip:has-text("Wszystko")')
await page.waitForTimeout(500)
check('powrót do wszystkiego',
  (await page.locator('.concept-item').count()) === 4,
  `${await page.locator('.concept-item').count()}`)

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
  footer.graf && footer.ustawienia && footer.licznik === '3 kafelki · 1 ścieżka',
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
