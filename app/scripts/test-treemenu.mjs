// Test menu tworzenia pod prawym przyciskiem na pustym miejscu listy:
// pozycja, kontekst folderu, tworzenie w nim, zamykanie.
import { chromium } from 'playwright'
import { nazwij, nowaSciezka, nowyFolder } from './lib.mjs'

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

// 4. „Nowy kafelek" z menu tworzy kafelek na poziomie głównym i go otwiera
await page.click('.concept-list', { button: 'right', position: { x: 100, y: 220 } })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Nowy kafelek")')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Z menu')
await page.waitForTimeout(400)
await page.click('.btn-close[title*="Zamknij kafelek"]')
check('kafelek z menu powstał i otworzył się',
  (await page.locator('.concept-item:has-text("Z menu")').count()) === 1)

// 5. folder + prawy przycisk w jego wnętrzu → tworzy w tym folderze
await nowyFolder(page, 'Algebra')
await page.waitForSelector('.folder-row')
await page.click('.folder-row:has-text("Algebra")')
await page.waitForSelector('.folder-children')
const box = await page.locator('.folder-children').boundingBox()
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
await page.waitForSelector('.tree-menu')
check('menu rozpoznaje folder, w którym kliknięto',
  (await page.locator('.tree-menu-where').textContent()).includes('Algebra'),
  await page.locator('.tree-menu-where').textContent())
await page.click('.tree-menu-item:has-text("Nowy kafelek")')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'W folderze')
await page.waitForTimeout(500)
await page.click('.btn-close[title*="Zamknij kafelek"]')
const inFolder = await page.evaluate(() => {
  const ul = document.querySelector('.folder-children')
  return [...ul.querySelectorAll('.concept-name')].map((n) => n.textContent)
})
check('kafelek powstał wewnątrz folderu', inFolder.includes('W folderze'),
  inFolder.join(' | '))

// 6. prawy przycisk na kafelku daje inne menu niż na pustym tle
await page.click('.concept-item:has-text("Z menu")', { button: 'right' })
await page.waitForSelector('.tree-menu')
const naRzeczy = await page.locator('.tree-menu-item').allTextContents()
check('prawy przycisk na kafelku nie proponuje tworzenia',
  !naRzeczy.join('|').includes('Nowy'),
  naRzeczy.map((s) => s.trim()).join(' · '))
await page.keyboard.press('Escape')

// 7. menu mieści się w oknie także przy dolnej krawędzi
await page.click('.concept-list', { button: 'right', position: { x: 100, y: 700 } })
await page.waitForSelector('.tree-menu')
const fits = await page.evaluate(() => {
  const r = document.querySelector('.tree-menu').getBoundingClientRect()
  return r.bottom <= window.innerHeight && r.right <= window.innerWidth
})
check('menu nie wychodzi poza okno', fits)

// -- menu na konkretnej rzeczy: zmiana nazwy, powielenie, usunięcie --

// 8. na kafelku menu pokazuje działania, nie tworzenie
await page.click('.concept-item:has-text("Z menu")', { button: 'right' })
await page.waitForSelector('.tree-menu')
const naKlocku = await page.locator('.tree-menu-item').allTextContents()
check('menu kafelka: nazwa, powielenie, usunięcie',
  naKlocku.length === 3 && naKlocku.join('|').includes('Powiel'),
  naKlocku.map((s) => s.trim()).join(' · '))
// menu rzeczy nie powtarza już jej nazwy — widać ją w wierszu, na który
// się kliknęło, a nagłówek tylko rozpychał menu
check('menu rzeczy nie powtarza jej nazwy',
  (await page.locator('.tree-menu .tree-menu-where').count()) === 0)

// 9. zmiana nazwy z menu (własne okienko, nie systemowy prompt)
await page.click('.tree-menu-item:has-text("Zmień nazwę")')
await nazwij(page, 'Przezwany')
check('zmiana nazwy z menu działa',
  (await page.locator('.concept-item:has-text("Przezwany")').count()) === 1)

// 10. powielenie kafelka: kopia obok pierwowzoru, z treścią, i od razu otwarta
await page.click('.concept-item:has-text("Przezwany")')
await page.waitForSelector('.view-switch')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.type('Treść pierwowzoru $a^2$.')
await page.waitForTimeout(600)
await page.click('.btn-close[title*="Zamknij kafelek"]')

await page.click('.concept-item:has-text("Przezwany")', { button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Powiel")')
await page.waitForSelector('.editor-name')
const kopiaNazwa = await page.inputValue('.editor-name')
check('kopia nazywa się „… (kopia)"', kopiaNazwa === 'Przezwany (kopia)', kopiaNazwa)
const kopiaTresc = await page.textContent('.editor-code .cm-content')
check('kopia ma treść pierwowzoru', kopiaTresc.includes('Treść pierwowzoru'), kopiaTresc)

// 11. zmiana w kopii nie rusza pierwowzoru
await page.click('.editor-code .cm-content')
await page.keyboard.press('Control+End')
await page.keyboard.type(' DOPISEK-W-KOPII')
await page.waitForTimeout(600)
await page.click('.concept-item:has-text("Przezwany"):not(:has-text("kopia"))')
await page.waitForTimeout(600)
const oryginal = await page.textContent('.editor-code .cm-content')
check('pierwowzór nietknięty przez zmianę w kopii',
  !oryginal.includes('DOPISEK-W-KOPII'), oryginal)
await page.click('.btn-close[title*="Zamknij kafelek"]')

// 12. powielenie folderu bierze zawartość
await page.click('.folder-row:has-text("Algebra")', { button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Powiel")')
await page.waitForTimeout(900)
check('powstał folder „Algebra (kopia)"',
  (await page.locator('.folder-row:has-text("Algebra (kopia)")').count()) === 1)
const wKopii = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.folder-row')].find((r) =>
    r.textContent.includes('Algebra (kopia)'),
  )
  const ul = row.parentElement.querySelector('.folder-children')
  return ul ? [...ul.querySelectorAll('.concept-name')].map((n) => n.textContent) : []
})
check('kopia folderu ma zawartość pierwowzoru', wKopii.includes('W folderze'),
  wKopii.join(' | '))

// 13. na ścieżce menu też działa
await nowaSciezka(page, 'Kurs')
await page.waitForSelector('.path-canvas')
await page.click('.concept-item:has-text("Kurs")', { button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Powiel")')
await page.waitForTimeout(700)
check('ścieżka daje się powielić',
  (await page.locator('.concept-item:has-text("Kurs (kopia)")').count()) === 1)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
