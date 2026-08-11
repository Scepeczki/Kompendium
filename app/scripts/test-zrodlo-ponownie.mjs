// Wpięcie GOTOWEGO prostokąta z PDF jako źródła drugiego kafelka: w trybie
// podpinania klik w istniejący fragment wpina go tam, gdzie pracujemy.
// Poza tym trybem klik prowadzi do kafelka — a gdy fragment ma kilku
// właścicieli, najpierw pyta, do którego.
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
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// pierwszy kafelek + źródło obrysowane w PDF
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Pierwszy')
await page.waitForTimeout(500)
await page.setInputFiles('input[type=file][accept="application/pdf"]', 'scripts/test.pdf')
await page.waitForSelector('.pdf-page-wrap canvas')
await page.waitForTimeout(1500)

await page.click('button:has-text("Podepnij źródło")')
await page.waitForSelector('.pdf-banner')
const c = await page.locator('.pdf-page-wrap canvas').first().boundingBox()
await page.mouse.move(c.x + 40, c.y + 40)
await page.mouse.down()
await page.mouse.move(c.x + 300, c.y + 100, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(900)
check('pierwszy kafelek ma źródło',
  (await page.locator('.source-chip').count()) === 1,
  `${await page.locator('.source-chip').count()}`)
check('fragment widać na stronie PDF', (await page.locator('.pdf-used').count()) >= 1)
await page.click('.btn-close[title*="Zamknij klocek"]')

// drugi kafelek — wpinamy TEN SAM fragment jednym kliknięciem
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Drugi')
await page.waitForTimeout(600)
check('drugi kafelek zaczyna bez źródeł',
  (await page.locator('.source-chip').count()) === 0)
await page.click('button:has-text("Podepnij źródło")')
await page.waitForSelector('.pdf-banner')
await page.waitForTimeout(400)
await page.locator('.pdf-used').first().click({ force: true })
await page.waitForTimeout(1000)
check('klik w gotowy prostokąt wpina go jako źródło',
  (await page.locator('.source-chip').count()) === 1,
  `${await page.locator('.source-chip').count()}`)
check('tryb podpinania się kończy',
  (await page.locator('.pdf-banner').count()) === 0)

// ten sam fragment ma teraz dwóch właścicieli — klik pyta, do którego skoczyć
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.waitForTimeout(600)
const ile = await page.locator('.pdf-used').count()
check('fragment jest teraz źródłem dwóch kafelków', ile === 2, `${ile}`)
// prostokąty leżą jeden na drugim — klikamy ten na wierzchu
await page.locator('.pdf-used').last().click({ force: true })
await page.waitForTimeout(500)
const menu = page.locator('.tree-menu:has-text("Ten fragment jest źródłem w:")')
check('klik pyta, do którego kafelka skoczyć', (await menu.count()) === 1)
const pozycje = await menu.locator('.tree-menu-item').allTextContents()
check('lista wymienia oba kafelki',
  pozycje.length === 2 && pozycje.includes('Pierwszy') && pozycje.includes('Drugi'),
  pozycje.join(' | '))
await menu.locator('.tree-menu-item:has-text("Drugi")').click()
await page.waitForSelector('.editor-name')
await page.waitForTimeout(500)
check('wybór z listy otwiera ten kafelek',
  (await page.inputValue('.editor-name')) === 'Drugi',
  await page.inputValue('.editor-name'))

// --- źródło podpięte do STARSZEJ wersji też widać na stronie ---
// (dawniej pokazywaliśmy tylko wersje bieżące, więc taki fragment znikał)
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Ze starszej')
await page.waitForTimeout(600)
// robimy drugą wersję i wracamy do pierwszej
await page.click('button:has-text("+ nowa wersja")')
await page.waitForSelector('.ask-dialog')
await page.click('.ask-foot .btn:last-child')
await page.waitForTimeout(900)
await page.locator('.version-pill').first().click()
await page.waitForTimeout(700)
const ileWczesniej = await page.locator('.pdf-used').count()
await page.click('button:has-text("Podepnij źródło")')
await page.waitForSelector('.pdf-banner')
const c2 = await page.locator('.pdf-page-wrap canvas').first().boundingBox()
await page.mouse.move(c2.x + 40, c2.y + 220)
await page.mouse.down()
await page.mouse.move(c2.x + 300, c2.y + 280, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(1000)
check('źródło ze starszej wersji widać jako prostokąt',
  (await page.locator('.pdf-used').count()) === ileWczesniej + 1,
  `${ileWczesniej} → ${await page.locator('.pdf-used').count()}`)
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.waitForTimeout(700)
check('widać je też z zewnątrz, po zamknięciu kafelka',
  (await page.locator('.pdf-used').count()) === ileWczesniej + 1,
  `${await page.locator('.pdf-used').count()}`)
// nowa wersja dostaje kopie źródeł poprzedniej — ten sam prostokąt ma się
// pokazać raz, a nie tyle razy, ile wersji
const etykiety = await page.locator('.pdf-used .pdf-used-label').allTextContents()
check('ten sam fragment nie dubluje się przez wersje',
  new Set(etykiety).size === etykiety.length,
  etykiety.join(' | '))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
