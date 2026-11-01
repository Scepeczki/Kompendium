// Spis treści jako warsztat, a nie tylko drogowskaz.
//
// W długim wykładzie przestawianie kafelków w samej Linii znaczy przeciąganie
// przez pół ekranu. W spisie wszystko widać naraz, więc to tam wygodnie jest
// przenosić — także z rozdziału do rozdziału. Notatki muszą być w spisie
// widoczne, bo inaczej znikałyby z układanki.
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
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

for (const n of ['Alfa', 'Beta', 'Gamma', 'Delta']) {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.waitForTimeout(350)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}

await nowaSciezka(page, 'Wykład')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')

// Alfa, Beta, §I, Gamma, §II, Delta, notatka
for (const n of ['Alfa', 'Beta']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(300)
}
await page.click('.linear-append .btn:has-text("Rozdział")')
await podaj(page, 'Rozdzial I')
await page.dragAndDrop('.concept-item:has-text("Gamma")', '.linear-append')
await page.waitForTimeout(300)
await page.click('.linear-append .btn:has-text("Rozdział")')
await podaj(page, 'Rozdzial II')
await page.dragAndDrop('.concept-item:has-text("Delta")', '.linear-append')
await page.waitForTimeout(300)
await page.click('.linear-append .btn:has-text("Notatka")')
await page.waitForTimeout(800)

const spis = page.locator('.outline')
/** Kolejność w Linii — nazwy siedzą w polach tekstowych, stąd i jedno, i drugie. */
const kolejnosc = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.linear-seg')].map((s) =>
      [...[...s.querySelectorAll('input')].map((i) => i.value), s.innerText]
        .join(' ')
        .slice(0, 30)
        .replace(/\s+/g, ' '),
    ),
  )

// spis szczegółowy pokazuje wszystko, co da się przeciągać
await page.click('.outline-rodzaj button[title^="Szczegółowy"]')
await page.waitForTimeout(300)
while (await page.locator('.outline-chev:not(.open):not(.pusty)').count()) await page.locator('.outline-chev:not(.open):not(.pusty)').first().click()
await page.waitForTimeout(350)

// --- notatka jest w spisie, po prostu jako notatka ---
const pozycje = await spis.locator('.outline-kafelek').allTextContents()
check('notatka jest w spisie treści',
  pozycje.some((t) => t.includes('Notatka')), pozycje.join(' | '))
check('spis pokazuje też wszystkie kafelki',
  ['Alfa', 'Beta', 'Gamma', 'Delta'].every((n) => pozycje.some((t) => t.includes(n))),
  pozycje.join(' | '))

// --- przeciąganie w spisie: Gamma z rozdziału I do rozdziału II ---
const przed = await kolejnosc()
check('na początek Gamma stoi przed rozdziałem II',
  przed.findIndex((t) => t.includes('Gamma')) <
    przed.findIndex((t) => t.includes('Rozdzial II')),
  przed.join(' | '))

const cel = spis.locator('.outline-item.level-1:has-text("Rozdzial II")')
const r = await cel.boundingBox()
await spis.locator('.outline-kafelek:has-text("Gamma")').dragTo(cel, {
  targetPosition: { x: 40, y: r.height - 3 }, // dolna połowa = „zaraz po"
})
await page.waitForTimeout(900)
const po = await kolejnosc()
check('Gamma przeniosła się do rozdziału II',
  po.findIndex((t) => t.includes('Gamma')) >
    po.findIndex((t) => t.includes('Rozdzial II')),
  po.join(' | '))
check('i stoi na jego początku, przed Deltą',
  po.findIndex((t) => t.includes('Gamma')) < po.findIndex((t) => t.includes('Delta')),
  po.join(' | '))
check('nic po drodze nie zginęło', po.length === przed.length,
  `${przed.length} → ${po.length}`)

// --- powrót: z rozdziału II z powrotem na sam początek ---
await spis.locator('.outline-kafelek:has-text("Gamma")').dragTo(
  spis.locator('.outline-kafelek:has-text("Alfa")'),
  { targetPosition: { x: 40, y: 2 } }, // górna połowa = „przed"
)
await page.waitForTimeout(900)
const naPoczatku = await kolejnosc()
check('przeciągnięcie na samą górę też działa',
  naPoczatku[0].includes('Gamma'), naPoczatku.join(' | '))

// --- szerokość spisu: rozciąga się i zostaje taka po przeładowaniu ---
const szerPrzed = (await spis.boundingBox()).width
const uchwyt = await spis.locator('.outline-uchwyt').boundingBox()
const y = uchwyt.y + uchwyt.height / 2
await page.mouse.move(uchwyt.x + 3, y)
await page.mouse.down()
await page.mouse.move(uchwyt.x + 143, y, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(400)
const szerPo = (await spis.boundingBox()).width
// dokładnie o tyle, o ile pojechała mysz — a nie „do maksimum"
check('spis daje się rozciągnąć dokładnie o tyle, o ile ciągniesz',
  Math.abs(szerPo - (szerPrzed + 140)) < 6,
  `${Math.round(szerPrzed)} → ${Math.round(szerPo)}`)

await page.reload()
await page.waitForSelector('text=Kompendium')
await page.click('.concept-item:has-text("Wykład")')
await page.waitForSelector('.outline')
await page.waitForTimeout(600)
const szerPoReload = (await page.locator('.outline').boundingBox()).width
check('szerokość jest zapamiętana', Math.abs(szerPoReload - szerPo) < 4,
  `${Math.round(szerPo)} → ${Math.round(szerPoReload)}`)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
