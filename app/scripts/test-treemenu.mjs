// Test menu tworzenia pod prawym przyciskiem na pustym miejscu listy:
// pozycja, kontekst folderu, tworzenie w nim, zamykanie.
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

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// 1. na pustej liście prawy przycisk otwiera menu z trzema pozycjami
await page.click('.concept-list', { button: 'right', position: { x: 100, y: 220 } })
await page.waitForSelector('.tree-menu')
const items = await page.locator('.tree-menu-item').allTextContents()
check('menu ma trzy pozycje tworzenia', items.length === 3,
  items.map((s) => s.trim()).join(' · '))
check('menu mówi, gdzie powstanie rzecz',
  (await page.locator('.tree-menu-where').textContent()).includes('poziomie głównym'))

// 2. Escape zamyka
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
check('Escape zamyka menu', (await page.locator('.tree-menu').count()) === 0)

// 3. klik gdzie indziej zamyka
await page.click('.concept-list', { button: 'right', position: { x: 100, y: 220 } })
await page.waitForSelector('.tree-menu')
await page.mouse.click(700, 500)
await page.waitForTimeout(200)
check('klik poza menu zamyka', (await page.locator('.tree-menu').count()) === 0)

// 4. „Nowy klocek" z menu tworzy klocek na poziomie głównym i go otwiera
await page.click('.concept-list', { button: 'right', position: { x: 100, y: 220 } })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Nowy klocek")')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Z menu')
await page.waitForTimeout(400)
await page.click('.btn-close[title*="Zamknij klocek"]')
check('klocek z menu powstał i otworzył się',
  (await page.locator('.concept-item:has-text("Z menu")').count()) === 1)

// 5. folder + prawy przycisk w jego wnętrzu → tworzy w tym folderze
page.once('dialog', (d) => d.accept('Algebra'))
await page.click('.sidebar-create-btn[title="Nowy folder"]')
await page.waitForSelector('.folder-row')
await page.click('.folder-row:has-text("Algebra")')
await page.waitForSelector('.folder-children')
const box = await page.locator('.folder-children').boundingBox()
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
await page.waitForSelector('.tree-menu')
check('menu rozpoznaje folder, w którym kliknięto',
  (await page.locator('.tree-menu-where').textContent()).includes('Algebra'),
  await page.locator('.tree-menu-where').textContent())
await page.click('.tree-menu-item:has-text("Nowy klocek")')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'W folderze')
await page.waitForTimeout(500)
await page.click('.btn-close[title*="Zamknij klocek"]')
const inFolder = await page.evaluate(() => {
  const ul = document.querySelector('.folder-children')
  return [...ul.querySelectorAll('.concept-name')].map((n) => n.textContent)
})
check('klocek powstał wewnątrz folderu', inFolder.includes('W folderze'),
  inFolder.join(' | '))

// 6. prawy przycisk na samym klocku nie otwiera menu tworzenia
await page.click('.concept-item:has-text("Z menu")', { button: 'right' })
await page.waitForTimeout(300)
check('prawy przycisk na klocku nie otwiera menu tworzenia',
  (await page.locator('.tree-menu').count()) === 0)

// 7. menu mieści się w oknie także przy dolnej krawędzi
await page.click('.concept-list', { button: 'right', position: { x: 100, y: 700 } })
await page.waitForSelector('.tree-menu')
const fits = await page.evaluate(() => {
  const r = document.querySelector('.tree-menu').getBoundingClientRect()
  return r.bottom <= window.innerHeight && r.right <= window.innerWidth
})
check('menu nie wychodzi poza okno', fits)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
