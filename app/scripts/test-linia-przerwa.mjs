// Linia: zaznaczone segmenty usuwa się naraz (menu i Delete), prawy przycisk
// w przerwie między kafelkami daje samo „wstaw", Linię da się przewinąć tak,
// że miejsce na dokładanie stoi u góry, a przycisk powrotu kotwicy ma ikonę.
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
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

for (const n of ['Jeden', 'Dwa', 'Trzy', 'Cztery', 'Piec']) {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.waitForTimeout(300)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}
await nowaSciezka(page, 'Wyklad L')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Jeden', 'Dwa', 'Trzy', 'Cztery', 'Piec']) {
  await page.dragAndDrop(`.concept-list > li > .concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(350)
}
const seg = (n) => page.locator(`.linear-seg:has(input[value="${n}"])`)
const ile = () => page.locator('.linear-seg').count()

// --- przerwa między kafelkami ---
const b = await seg('Dwa').boundingBox()
await page.mouse.click(b.x + b.width / 2, b.y + 2, { button: 'right' })
await page.waitForSelector('.linear-menu')
let menu = await page.locator('.linear-menu').innerText()
check('prawy przycisk w przerwie daje samo „wstaw"',
  menu.includes('Wstaw') && !menu.includes('Usuń ze ścieżki') && !menu.includes('Otwórz kafelek'), menu.replace(/\n/g, ' / '))
await page.click('.linear-menu .dodaj-kafelek:has-text("Kafelek") > button')
await page.waitForTimeout(700)
const kolej = await page.evaluate(() =>
  [...document.querySelectorAll('.linear-seg')].map((s) => s.innerText.split('\n').find((l) => l.trim().length > 2) ?? ''))
check('kafelek z przerwy staje w tej przerwie (przed „Dwa")', /tutejszy/.test(kolej[1]), kolej.join(' | '))

// --- kafelek dalej ma swoje menu ---
await seg('Trzy').click({ button: 'right', position: { x: 240, y: 20 } })
await page.waitForSelector('.linear-menu')
menu = await page.locator('.linear-menu').innerText()
check('na samym kafelku menu jest pełne', menu.includes('Usuń ze ścieżki') && menu.includes('Otwórz kafelek'))
await page.mouse.click(5, 820)

// --- usuwanie zaznaczonych z menu ---
const przed = await ile()
await seg('Jeden').click({ position: { x: 240, y: 20 }, modifiers: ['Control'] })
await seg('Dwa').click({ position: { x: 240, y: 20 }, modifiers: ['Control'] })
await seg('Dwa').click({ button: 'right', position: { x: 240, y: 20 } })
await page.waitForSelector('.linear-menu')
check('menu na zaznaczonych proponuje usunąć wszystkie',
  (await page.locator('.linear-menu .tree-menu-item:has-text("Usuń zaznaczone ze ścieżki (2)")').count()) === 1)
await page.click('.linear-menu .tree-menu-item:has-text("Usuń zaznaczone ze ścieżki")')
await page.waitForTimeout(900)
check('znikają oba naraz', (await ile()) === przed - 2, `${przed} → ${await ile()}`)

// --- Delete ---
// Ctrl+klik w treść kafelka, a nie w pole nazwy (tam Delete należy do pisania)
await seg('Trzy').click({ position: { x: 240, y: 70 }, modifiers: ['Control'] })
await seg('Cztery').click({ position: { x: 240, y: 70 }, modifiers: ['Control'] })
await page.keyboard.press('Delete')
await page.waitForTimeout(900)
check('klawisz Delete usuwa zaznaczone segmenty', (await ile()) === przed - 4, String(await ile()))
const d = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium'); await new Promise((r) => (req.onsuccess = r))
  const q = req.result.transaction('concepts').objectStore('concepts').getAll()
  await new Promise((r) => (q.onsuccess = r)); req.result.close(); return q.result.map((c) => c.name)
})
check('kafelki z listy zostają w bibliotece', ['Jeden', 'Dwa', 'Trzy', 'Cztery'].every((n) => d.includes(n)))

// --- przewijanie: miejsce na dokładanie dojeżdża do góry ---
for (let i = 0; i < 12; i++) {
  await page.dragAndDrop('.concept-list > li > .concept-item:has-text("Jeden")', '.linear-append')
  await page.waitForTimeout(150)
}
await page.evaluate(() => { const v = document.querySelector('.linear-view'); v.scrollTop = v.scrollHeight })
await page.waitForTimeout(400)
const gora = await page.evaluate(() => {
  const v = document.querySelector('.linear-view').getBoundingClientRect()
  const a = document.querySelector('.linear-append').getBoundingClientRect()
  return Math.round(a.top - v.top)
})
check('na dole Linii miejsce na dokładanie da się przewinąć pod górną krawędź', gora < 160, `${gora} px od góry`)

// --- kotwica ---
await page.click('.path-toolbar .path-maly:not(.btn-close)')
await page.click('.concept-list > li > .concept-item:has-text("Piec")')
await page.waitForSelector('.kotwica-powrot')
check('przycisk powrotu ma ikonę kotwicy i skrót', (await page.locator('.kotwica-powrot svg').count()) === 1 &&
  (await page.locator('.kotwica-powrot').innerText()).includes('Alt+Z'))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
if (problems.length || errors.length) process.exit(1)
