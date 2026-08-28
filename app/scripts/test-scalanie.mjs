// Scalanie: kilka kafelków ma być JEDNYM tekstem w JEDNYM polu do pisania,
// a to, co się w nim napisze, ma wrócić do właściwego kafelka.
//
// To jest test bezpieczeństwa, nie wyglądu. Wspólne pole trzyma tekst kilku
// kafelków naraz i przy każdym zapisie tnie go z powrotem — pomyłka o jeden
// akapit oznaczałaby zdanie zapisane do cudzego kafelka.
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
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const zrob = async (nazwa, tekst) => {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', nazwa)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(tekst)
  await page.waitForTimeout(400)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}
await zrob('Pierwszy', 'AAA tekst pierwszego kafelka.')
await zrob('Drugi', 'BBB tekst drugiego kafelka.')
await zrob('Trzeci', 'CCC tekst trzeciego kafelka.')

await nowaSciezka(page, 'Scalanie')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Pierwszy', 'Drugi', 'Trzeci']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(450)
}
await page.hover('.linear-seg:first-child')
await page.click('.linear-seg:first-child .folder-action[title*="Scal z następnym"]')
await podaj(page, 'Trzy w jednym')
await page.waitForTimeout(800)
await page.hover('.linear-seg:first-child')
await page.click('.linear-seg:first-child .folder-action[title*="Dołącz następny"]')
await page.waitForSelector('.script-group-block')
await page.waitForTimeout(900)

// 1. trzy kafelki bez stron = JEDNO pole
check(
  'trzy scalone kafelki to jedno pole do pisania',
  (await page.locator('.script-group-block .linear-pole').count()) === 1,
  `pól ${await page.locator('.script-group-block .linear-pole').count()}`,
)
check(
  'i jeden ciągły tekst',
  (await page.locator('.script-group-block .tiptap').count()) === 1,
)

const czytajCzesci = () =>
  page.evaluate(async () => {
    const req = indexedDB.open('kompendium')
    const db = await new Promise((res) => {
      req.onsuccess = () => res(req.result)
    })
    const paths = await new Promise((res) => {
      const r = db.transaction('paths').objectStore('paths').getAll()
      r.onsuccess = () => res(r.result)
    })
    const f = paths[0].nodes.find((n) => n.kind === 'fusion')
    return f.parts.map((p) => Object.values(p.wlasneTresci ?? {}).join(' '))
  })

// 2. kursor przechodzi przez granicę kafelków — to jest jeden dokument
await page.locator('.script-group-block .tiptap p:has-text("AAA")').click()
await page.keyboard.press('End')
await page.keyboard.press('ArrowDown')
await page.keyboard.press('End')
await page.keyboard.type(' KURSOR-PRZESZEDL')
await page.waitForTimeout(1300)

const poStrzalce = await czytajCzesci()
check(
  'strzałka w dół wchodzi w następny kafelek, a nie zatrzymuje się na styku',
  poStrzalce[1].includes('KURSOR-PRZESZEDL'),
  JSON.stringify(poStrzalce),
)
check(
  'i nie dopisuje niczego pierwszemu kafelkowi',
  !poStrzalce[0].includes('KURSOR-PRZESZEDL') && poStrzalce[0].includes('AAA'),
  poStrzalce[0],
)

// 3. pisanie na końcu każdego kafelka trafia dokładnie tam
for (const para of [
  ['AAA', 'DO-PIERWSZEGO'],
  ['CCC', 'DO-TRZECIEGO'],
]) {
  await page.locator(`.script-group-block .tiptap p:has-text("${para[0]}")`).click()
  await page.keyboard.press('End')
  await page.keyboard.type(` ${para[1]}`)
  await page.waitForTimeout(1300)
}
const poPisaniu = await czytajCzesci()
check(
  'dopisek na końcu pierwszego kafelka zostaje w pierwszym',
  poPisaniu[0].includes('DO-PIERWSZEGO') && !poPisaniu[1].includes('DO-PIERWSZEGO'),
  poPisaniu[0],
)
check(
  'dopisek na końcu trzeciego kafelka zostaje w trzecim',
  poPisaniu[2].includes('DO-TRZECIEGO') && !poPisaniu[1].includes('DO-TRZECIEGO'),
  poPisaniu[2],
)
check(
  'żaden kafelek nie stracił swojej treści',
  poPisaniu[0].includes('AAA') &&
    poPisaniu[1].includes('BBB') &&
    poPisaniu[2].includes('CCC'),
  JSON.stringify(poPisaniu),
)

// 4. wszystko przeżywa przeładowanie
await page.reload()
await page.waitForSelector('.concept-item')
await page.click('.concept-item:has-text("Scalanie")')
await page.waitForSelector('.script-group-block')
await page.waitForTimeout(900)
const widoczne = await page.textContent('.script-group-block')
check(
  'po przeładowaniu tekst jest w komplecie',
  ['AAA', 'BBB', 'CCC', 'DO-PIERWSZEGO', 'DO-TRZECIEGO', 'KURSOR-PRZESZEDL'].every((t) =>
    widoczne.includes(t),
  ),
  widoczne.slice(0, 140),
)
check(
  'i nadal jest to jedno pole',
  (await page.locator('.script-group-block .linear-pole').count()) === 1,
)

// 5. pasek stron dzieli tekst na dwa pola, a skasowanie zrasta z powrotem
await page.locator('.script-group-block .tiptap p:has-text("BBB")').click({ button: 'right' })
await page.waitForSelector('.linear-menu')
await page.click('.linear-menu .tree-menu-item:has-text("Pasek stron w tym miejscu")')
await page.waitForTimeout(1000)
check(
  'pasek rozcina wspólne pole na dwa',
  (await page.locator('.script-group-block .linear-pole').count()) === 2,
  `pól ${await page.locator('.script-group-block .linear-pole').count()}`,
)
await page.locator('.script-group-block .group-pasek').first().click({ button: 'right' })
await page.waitForSelector('.tree-menu-item:has-text("Usuń ten pasek")')
await page.click('.tree-menu-item:has-text("Usuń ten pasek")')
await page.waitForTimeout(1000)
check(
  'skasowanie paska zrasta tekst w jedno pole',
  (await page.locator('.script-group-block .linear-pole').count()) === 1,
  `pól ${await page.locator('.script-group-block .linear-pole').count()}`,
)
const naKoniec = await czytajCzesci()
check(
  'i po całej zabawie nic nie zginęło',
  naKoniec[0].includes('AAA') && naKoniec[1].includes('BBB') && naKoniec[2].includes('CCC'),
  JSON.stringify(naKoniec),
)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
