// Test grafu powiązań: klik otwiera klocek, przeciąganie NIE otwiera,
// samo naciśnięcie nie rusza układu, dopasowanie widoku mieści całość.
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

// trzy klocki połączone wiki-linkami
const mk = async (name, tresc) => {
  await page.click('.sidebar-create-btn[title="Nowy klocek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(tresc)
  await page.waitForTimeout(500)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}
await mk('Zbior', 'Podstawa wszystkiego.')
await mk('Funkcja', 'Przyporzadkowanie miedzy [[Zbior]]ami.')
await mk('Ciag', 'Funkcja na liczbach naturalnych, patrz [[Funkcja]] i [[Zbior]].')

await page.click('.sidebar-foot-btn[title*="Graf"]')
await page.waitForSelector('.graph-node')
// czekamy na pierwsze samodzielne dopasowanie widoku
await page.waitForTimeout(1600)

const polozenia = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.graph-node')].map((g) => {
      const r = g.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y) }
    }),
  )

// 1. samo naciśnięcie i puszczenie w miejscu nie rusza układu przed otwarciem
const przed = await polozenia()
const wezel = await page.locator('.graph-node circle').first().boundingBox()
await page.mouse.move(wezel.x + wezel.width / 2, wezel.y + wezel.height / 2)
await page.mouse.down()
await page.waitForTimeout(500)
const wTrakcie = await polozenia()
const ruch = Math.max(
  ...przed.map((p, i) => Math.hypot(p.x - wTrakcie[i].x, p.y - wTrakcie[i].y)),
)
check('samo naciśnięcie nie rozjeżdża grafu', ruch < 3, `największe drgnięcie: ${ruch.toFixed(1)}px`)

// 2. puszczenie bez ruchu = klik → otwiera klocek
await page.mouse.up()
await page.waitForSelector('.editor-name', { timeout: 5000 })
const otwarty = await page.inputValue('.editor-name')
check('klik w węzeł otwiera klocek', otwarty.length > 0, otwarty)

// 3. przeciągnięcie węzła NIE otwiera klocka
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.click('.sidebar-foot-btn[title*="Graf"]')
await page.waitForSelector('.graph-node')
await page.waitForTimeout(1600)
const w2 = await page.locator('.graph-node circle').first().boundingBox()
await page.mouse.move(w2.x + w2.width / 2, w2.y + w2.height / 2)
await page.mouse.down()
await page.mouse.move(w2.x + 140, w2.y + 90, { steps: 12 })
await page.waitForTimeout(300)

// 4. węzeł idzie za kursorem — mierzone przy wciśniętym przycisku, bo po
// puszczeniu układ ściąga go z powrotem (to normalne zachowanie sprężyn)
const wRuchu = await page.locator('.graph-node circle').first().boundingBox()
const przesuniecie = Math.hypot(wRuchu.x - w2.x, wRuchu.y - w2.y)
check('przeciąganie prowadzi węzeł za kursorem', przesuniecie > 80,
  `przesunięcie: ${przesuniecie.toFixed(0)}px`)

await page.mouse.up()
await page.waitForTimeout(500)
check('przeciąganie węzła nie otwiera klocka',
  (await page.locator('.editor-name').count()) === 0 &&
    (await page.locator('.graph-node').count()) > 0)

// 5. „Dopasuj" mieści wszystkie węzły w oknie
await page.mouse.wheel(0, -600) // celowo rozjedź widok
await page.waitForTimeout(400)
await page.click('.graph-fit')
await page.waitForTimeout(500)
const miesci = await page.evaluate(() => {
  const svg = document.querySelector('.graph-svg').getBoundingClientRect()
  return [...document.querySelectorAll('.graph-node circle')].every((c) => {
    const r = c.getBoundingClientRect()
    return r.left >= svg.left - 1 && r.right <= svg.right + 1 && r.top >= svg.top - 1 && r.bottom <= svg.bottom + 1
  })
})
check('„Dopasuj" mieści cały graf w oknie', miesci)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
