// Test paska bocznego: szukanie i filtr typu schowane pod ikonami,
// rząd tworzenia nad drzewem, dolny pasek z grafem i ustawieniami.
import { chromium } from 'playwright'

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
  await page.click('.sidebar-create-btn[title="Nowy klocek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.selectOption('.type-select', t)
  await page.waitForTimeout(350)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}

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
check('po schowaniu widać znów wszystkie klocki',
  (await page.locator('.concept-item').count()) === 3,
  `${await page.locator('.concept-item').count()}`)

// 4. ikona filtra otwiera listę typów i wybór zawęża widok
await page.click('.sidebar-tool-wrap .sidebar-tool')
await page.waitForSelector('.sidebar-filter-pop')
const items = await page.locator('.sidebar-filter-item').count()
check('lista typów zawiera wszystkie typy + „Wszystkie"', items === 6, `pozycji: ${items}`)
await page.click('.sidebar-filter-item:has-text("Twierdzenie")')
await page.waitForTimeout(500)
check('lista typów zamyka się po wyborze',
  (await page.locator('.sidebar-filter-pop').count()) === 0)
const filtered = await page.locator('.concept-item').allTextContents()
check('filtr typu zawęża listę', filtered.length === 1 && filtered[0].includes('Twierdzenie'),
  filtered.join(' | '))

// 5. przy włączonym filtrze ikona pokazuje wybrany typ
const tag = await page.locator('.sidebar-tool-tag').textContent()
check('ikona filtra pokazuje wybrany typ', tag === 'TW', `pokazuje: ${tag}`)

// 6. powrót do „Wszystkie typy"
await page.click('.sidebar-tool-wrap .sidebar-tool')
await page.waitForSelector('.sidebar-filter-pop')
await page.click('.sidebar-filter-item:has-text("Wszystkie typy")')
await page.waitForTimeout(500)
check('powrót do wszystkich typów',
  (await page.locator('.concept-item').count()) === 3 &&
    (await page.locator('.sidebar-tool-tag').count()) === 0)

// 7. rząd tworzenia nad drzewem i dolny pasek
const create = await page.locator('.sidebar-create-btn').allTextContents()
check('rząd tworzenia: klocek, folder, ścieżka', create.length === 3,
  create.map((s) => s.trim()).join(' · '))
const footer = await page.evaluate(() => ({
  graf: !!document.querySelector('.sidebar-foot-btn[title*="Graf"]'),
  ustawienia: !!document.querySelector('.sidebar-foot-btn[title="Ustawienia"]'),
  licznik: document.querySelector('.sidebar-counts')?.textContent?.trim(),
}))
check('dolny pasek: graf, licznik, ustawienia',
  footer.graf && footer.ustawienia && footer.licznik === '3 · 0',
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
