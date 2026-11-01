// Rozdział obejmuje wszystko aż do następnego rozdziału tego samego lub wyższego
// poziomu: zwija się z podrozdziałami, jedzie z zawartością, a zmiana poziomu
// przesuwa je razem z nim.
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

for (const n of ['Alfa', 'Beta', 'Gamma']) {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.waitForTimeout(350)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}

await nowaSciezka(page, 'Drzewo')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')

const dolozRozdzial = async (rodzaj, nazwa) => {
  await page.click(`.linear-append .btn:has-text("${rodzaj}")`)
  await podaj(page, nazwa)
  await page.waitForTimeout(300)
}
const dolozKafelek = async (n) => {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(300)
}

// A[Alfa, a1[Beta]], B[Gamma]
await dolozRozdzial('Rozdział', 'Glowny A')
await dolozKafelek('Alfa')
await dolozRozdzial('Podrozdział', 'Pod a1')
await dolozKafelek('Beta')
await dolozRozdzial('Rozdział', 'Glowny B')
await dolozKafelek('Gamma')
await page.waitForTimeout(600)

const spis = page.locator('.outline')
const rozdzial = (n) => spis.locator(`.outline-item:has-text("${n}")`)
const strzalka = (n) => spis.locator(`.outline-wiersz:has(.outline-item:has-text("${n}")) button.outline-chev`)
const kolejnosc = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.linear-seg')]
      .map((s) => [...[...s.querySelectorAll('input')].map((i) => i.value), s.innerText].join(' '))
      .map((t) => ['Glowny A', 'Pod a1', 'Glowny B', 'Alfa', 'Beta', 'Gamma'].find((n) => t.includes(n))),
  )

await page.click('.outline-rodzaj button[title^="Szczegółowy"]')
await page.waitForTimeout(400)
for (const n of ['Glowny A', 'Glowny B']) {
  if (await strzalka(n).evaluate((b) => b.classList.contains('open'))) await strzalka(n).click()
}
await page.waitForTimeout(350)

// --- zwijanie ---
check('zwinięty rozdział chowa swój podrozdział', (await rozdzial('Pod a1').count()) === 0)
const wierszA = spis.locator('li:has(> .outline-wiersz .outline-item:has-text("Glowny A"))')
check('jego kuleczki liczą też kafelki z podrozdziału',
  (await wierszA.locator('.outline-kropka').count()) === 2)
await strzalka('Glowny A').click()
await page.waitForTimeout(350)
check('po rozwinięciu widać podrozdział', await rozdzial('Pod a1').isVisible())
check('kafelek rozdziału stoi nad podrozdziałem, a kafelek podrozdziału zostaje zwinięty',
  (await spis.locator('.outline-kafelek:has-text("Alfa")').count()) === 1 &&
    (await spis.locator('.outline-kafelek:has-text("Beta")').count()) === 0)
await strzalka('Pod a1').click()
await page.waitForTimeout(350)
check('podrozdział rozwija się osobno', await spis.locator('.outline-kafelek:has-text("Beta")').isVisible())

// --- spis ogólny ---
await page.click('.outline-rodzaj button[title^="Ogólny"]')
await page.waitForTimeout(300)
check('ogólny pokazuje podrozdziały od razu', await rozdzial('Pod a1').isVisible())
await strzalka('Glowny A').click()
await page.waitForTimeout(300)
check('w ogólnym też można zwinąć', (await rozdzial('Pod a1').count()) === 0)
await strzalka('Glowny A').click()
await page.waitForTimeout(300)

// --- zmiana poziomu niesie podrozdziały ---
const klasa = (n) => rozdzial(n).getAttribute('class')
await spis.locator('.outline-wiersz:has(.outline-item:has-text("Glowny A")) .outline-poziom button').nth(1).click()
await page.waitForTimeout(500)
check('poziom niżej przesuwa też podrozdział',
  (await klasa('Glowny A')).includes('level-2') && (await klasa('Pod a1')).includes('level-3'))
await spis.locator('.outline-wiersz:has(.outline-item:has-text("Glowny A")) .outline-poziom button').nth(0).click()
await page.waitForTimeout(500)
check('poziom wyżej tak samo',
  (await klasa('Glowny A')).includes('level-1') && (await klasa('Pod a1')).includes('level-2'))

await rozdzial('Glowny A').click({ button: 'right' })
await page.waitForSelector('.linear-menu .menu-poziomy')
check('menu blokuje poziom, na którym podrozdział nie miałby miejsca',
  await page.locator('.linear-menu .menu-poziomy button:has-text("6")').isDisabled() &&
    await page.locator('.linear-menu .menu-poziomy button:has-text("5")').isEnabled())
await page.keyboard.press('Escape')

// --- przenoszenie z zawartością ---
const przed = await kolejnosc()
check('kolejność startowa', przed.join() === 'Glowny A,Alfa,Pod a1,Beta,Glowny B,Gamma', przed.join())
const cel = rozdzial('Glowny B')
const r = await cel.boundingBox()
await rozdzial('Glowny A').dragTo(cel, { targetPosition: { x: 40, y: r.height - 3 } })
await page.waitForTimeout(900)
const po = await kolejnosc()
check('rozdział jedzie z podrozdziałem i kafelkami i nie rozcina cudzych kafelków',
  po.join() === 'Glowny B,Gamma,Glowny A,Alfa,Pod a1,Beta', po.join())

await rozdzial('Pod a1').dragTo(rozdzial('Glowny A'), { targetPosition: { x: 40, y: 2 } })
await page.waitForTimeout(900)
const poPod = await kolejnosc()
check('podrozdział przenosi się z własnym kafelkiem, bez cudzego',
  poPod.join() === 'Glowny B,Gamma,Pod a1,Beta,Glowny A,Alfa', poPod.join())

await rozdzial('Glowny A').dragTo(rozdzial('Glowny A'), { targetPosition: { x: 80, y: 2 } })
await page.waitForTimeout(500)
check('upuszczenie na samego siebie niczego nie zmienia', (await kolejnosc()).join() === poPod.join())

// --- to samo za uchwyt w Linii ---
await page.locator('.linear-seg:has(input[value="Pod a1"])').hover()
await page.locator('.linear-seg:has(input[value="Pod a1"]) .linear-grip').dragTo(
  page.locator('.linear-seg:has(input[value="Glowny B"])'),
  { targetPosition: { x: 200, y: 2 } },
)
await page.waitForTimeout(900)
const poUchwycie = await kolejnosc()
check('uchwyt w Linii też przenosi rozdział z zawartością',
  poUchwycie.join() === 'Pod a1,Beta,Glowny B,Gamma,Glowny A,Alfa', poUchwycie.join())

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
