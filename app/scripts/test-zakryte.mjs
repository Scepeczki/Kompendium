// Tryb przypominania: kafelki zakryte, odsłaniane i zakrywane kliknięciem.
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
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(t)
  await page.waitForTimeout(400)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}

await nowaSciezka(page, 'Kresy')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
await page.click('.linear-append .btn:has-text("Rozdział")')
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

// klik w odsłonięty chowa go z powrotem — można spróbować jeszcze raz
await page.locator('.kafelek-odslony').first().click()
await page.waitForTimeout(900)
check('klik w odsłonięty zakrywa go z powrotem',
  (await page.locator('.kafelek-zakryty').count()) === 2 &&
    !(await page.textContent('.linear-column')).includes('Najmniejsze ograniczenie'),
  `zakrytych: ${await page.locator('.kafelek-zakryty').count()}`)

// w trybie przypominania treść jest do czytania, nie do pisania
await page.locator('.kafelek-zakryty').first().click()
await page.waitForTimeout(900)
check('odsłonięta treść nie zaprasza do pisania',
  (await page.locator('.kafelek-odslony .linear-pole .tiptap').count()) === 0 ||
    (await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('.kafelek-odslony > *')).pointerEvents ===
        'none',
    )))

await page.click('.path-toolbar button[title*="Odkryj wszystko"]')
await page.waitForTimeout(900)
check('wyjście z trybu odsłania wszystko',
  (await page.locator('.kafelek-zakryty').count()) === 0)
check('po wyjściu z trybu znów da się pisać',
  (await page.locator('.kafelek-odslony').count()) === 0)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()

