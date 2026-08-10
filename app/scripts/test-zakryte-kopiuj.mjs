// Tryb przypominania (kafelki zakryte, odsłaniane kliknięciem) i kopiowanie
// ścieżki jako tekst — całej i samego rozdziału.
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
const page = await browser.newPage({
  viewport: { width: 1700, height: 1000 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

for (const [n, t] of [
  ['Kres gorny', 'Najmniejsze ograniczenie gorne zbioru.'],
  ['Notacja', 'Piszemy sup A.'],
]) {
  await page.click('.sidebar-create-btn[title="Nowy klocek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(t)
  await page.waitForTimeout(400)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}

await nowaSciezka(page, 'Kresy')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
await page.click('.linear-append .btn:has-text("§ Rozdział")')
await podaj(page, 'Rozdzial o kresach')
await page.waitForTimeout(700)
for (const n of ['Kres gorny', 'Notacja']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(500)
}
await page.waitForTimeout(1500)

// --- tryb zakryty ---
check('kafelki są widoczne przed zakryciem',
  (await page.locator('.kafelek-zakryty').count()) === 0)
await page.click('.path-toolbar button[title*="Tryb zakryty"]')
await page.waitForTimeout(900)
const zakryte = await page.locator('.kafelek-zakryty').count()
check('po zakryciu treści nie widać', zakryte === 2, `zakrytych: ${zakryte}`)
check('treść naprawdę zniknęła z ekranu',
  !(await page.textContent('.linear-column')).includes('Najmniejsze ograniczenie'))
check('ale widać, co to za kafelek',
  (await page.textContent('.linear-column')).includes('Kres gorny'))
// nazwa rozdziału siedzi w polu tekstowym, więc czytamy jego wartość
const nazwyRozdzialow = await page
  .locator('.linear-seg .script-heading-node .inline-title')
  .evaluateAll((el) => el.map((i) => i.value))
check('rozdział zostaje widoczny', nazwyRozdzialow.includes('Rozdzial o kresach'),
  nazwyRozdzialow.join(' | '))

await page.locator('.kafelek-zakryty').first().click()
await page.waitForTimeout(900)
check('kliknięcie odsłania ten jeden kafelek',
  (await page.textContent('.linear-column')).includes('Najmniejsze ograniczenie'))
check('pozostałe zostają zakryte',
  (await page.locator('.kafelek-zakryty').count()) === 1,
  `${await page.locator('.kafelek-zakryty').count()}`)

await page.click('.path-toolbar button[title*="Odkryj wszystko"]')
await page.waitForTimeout(900)
check('wyjście z trybu odsłania wszystko',
  (await page.locator('.kafelek-zakryty').count()) === 0)

// --- kopiowanie całej ścieżki ---
await page.click('.path-toolbar button:has-text("Kopiuj")')
await page.waitForTimeout(900)
const caly = await page.evaluate(() => navigator.clipboard.readText())
check('skopiowany tekst ma nazwę ścieżki', caly.includes('# Kresy'), caly.slice(0, 60))
check('ma rozdział', caly.includes('Rozdzial o kresach'))
check('ma treści obu kafelków',
  caly.includes('Najmniejsze ograniczenie') && caly.includes('Piszemy sup A'),
  caly.slice(0, 200))
check('ma rodzaje kafelków', /Definicja:/.test(caly), caly.slice(0, 200))

// --- kopiowanie samego rozdziału ---
await page.evaluate(() => navigator.clipboard.writeText(''))
const nrRozdzialu = await page.evaluate(() =>
  [...document.querySelectorAll('.linear-seg')].findIndex((s) =>
    s.querySelector('.script-heading-node'),
  ),
)
const seg = page.locator('.linear-seg').nth(nrRozdzialu)
await seg.evaluate((el) => el.scrollIntoView({ block: 'center' }))
const b = await seg.boundingBox()
await page.mouse.click(b.x + b.width / 2, b.y + 6, { button: 'right' })
await page.waitForSelector('.linear-menu')
check('menu rozdziału ma kopiowanie',
  (await page.locator('.linear-menu .tree-menu-item:has-text("Kopiuj rozdział")').count()) === 1,
  (await page.locator('.linear-menu .tree-menu-item').allTextContents()).join(' · '))
await page.click('.linear-menu .tree-menu-item:has-text("Kopiuj rozdział")')
await page.waitForTimeout(900)
const rozdzial = await page.evaluate(() => navigator.clipboard.readText())
check('kopia rozdziału zaczyna się od niego, bez nazwy ścieżki',
  rozdzial.startsWith('## Rozdzial o kresach') && !rozdzial.includes('# Kresy\n'),
  rozdzial.slice(0, 80))
check('kopia rozdziału zawiera jego kafelki',
  rozdzial.includes('Najmniejsze ograniczenie'), rozdzial.slice(0, 200))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
