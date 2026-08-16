// Ctrl+Z w ścieżce: cofa usunięcie kafelka, scalenie i dołożenie rozdziału.
// Ctrl+Shift+Z ponawia. W polu tekstowym cofanie należy do edytora, nie do nas.
import { chromium } from 'playwright'
import { nowaSciezka, podaj, potwierdz } from './lib.mjs'

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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

for (const n of ['Alfa', 'Beta', 'Gamma']) {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(`Tresc ${n}.`)
  await page.waitForTimeout(350)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}
await nowaSciezka(page, 'Cofanie')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Alfa', 'Beta', 'Gamma']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(500)
}
await page.waitForTimeout(1500)

const ile = () => page.locator('.linear-seg').count()
const cofnij = async () => {
  await page.evaluate(() => document.activeElement?.blur?.())
  await page.locator('.linear-view').click({ position: { x: 20, y: 500 } })
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(700)
}
const ponow = async () => {
  await page.keyboard.press('Control+Shift+z')
  await page.waitForTimeout(700)
}

/** Prawy przycisk na górnej połowie segmentu. */
const menuNad = async (nr) => {
  await page.evaluate(() => document.activeElement?.blur?.())
  const seg = page.locator('.linear-seg').nth(nr)
  await seg.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const b = await seg.boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + 6, { button: 'right' })
  await page.waitForSelector('.linear-menu')
}

check('trzy kafelki na start', (await ile()) === 3, `${await ile()}`)

// 1. usunięcie kafelka — spod prawego przycisku — i cofnięcie go
await menuNad(1)
check('usuwanie jest w menu pod prawym przyciskiem',
  (await page.locator('.linear-menu .tree-menu-item:has-text("Usuń ze ścieżki")').count()) === 1,
  (await page.locator('.linear-menu .tree-menu-item').allTextContents()).join(' · '))
check('krzyżyka przy uchwycie już nie ma',
  (await page.locator('.linear-side .folder-action[title="Usuń ze ścieżki"]').count()) === 0)
await page.click('.linear-menu .tree-menu-item:has-text("Usuń ze ścieżki")')
await page.waitForTimeout(900)
check('kafelek zniknął', (await ile()) === 2, `${await ile()}`)
await cofnij()
check('Ctrl+Z przywraca usunięty kafelek', (await ile()) === 3, `${await ile()}`)
const nazwy = await page.evaluate(() =>
  [...document.querySelectorAll('.linear-seg .script-block-title .inline-title')].map(
    (i) => i.value,
  ),
)
check('wraca ten sam kafelek i na swoje miejsce',
  nazwy.join('|') === 'Alfa|Beta|Gamma', nazwy.join(' | '))

// 2. ponowienie cofniętego
await ponow()
check('Ctrl+Shift+Z ponawia usunięcie', (await ile()) === 2, `${await ile()}`)
await cofnij()
check('i da się to jeszcze raz cofnąć', (await ile()) === 3, `${await ile()}`)

// 3. cofnięcie scalenia
await page.locator('.linear-seg').nth(0).click({ modifiers: ['Control'] })
await page.locator('.linear-seg').nth(1).click({ modifiers: ['Control'] })
await page.waitForTimeout(300)
await menuNad(1)
await page.click('.linear-menu .tree-menu-item:has-text("Scal zaznaczone")')
await podaj(page, 'Scalone')
await page.waitForTimeout(1500)
check('scalenie zaszło', (await page.locator('.script-group-block').count()) === 1)
await cofnij()
check('Ctrl+Z cofa scalenie',
  (await page.locator('.script-group-block').count()) === 0 && (await ile()) === 3,
  `grup: ${await page.locator('.script-group-block').count()}, kafelków: ${await ile()}`)

// 4. cofnięcie dołożonego rozdziału
await menuNad(0)
await page.click('.linear-menu .tree-menu-item:has-text("Rozdział"):not(:has-text("Pod"))')
await podaj(page, 'Rozdzial')
await page.waitForTimeout(1200)
check('rozdział doszedł', (await ile()) === 4, `${await ile()}`)
await cofnij()
check('Ctrl+Z cofa dołożony rozdział', (await ile()) === 3, `${await ile()}`)

// 5. w polu tekstowym cofanie należy do edytora, a nie do ścieżki
await page.locator('.linear-seg').first().locator('.linear-pole .tiptap').click()
await page.keyboard.press('End')
await page.keyboard.type(' DOPISEK')
await page.waitForTimeout(900)
await page.keyboard.press('Control+z')
await page.waitForTimeout(700)
check('Ctrl+Z w polu cofa litery, a nie kafelki',
  (await ile()) === 3 &&
    !(await page.textContent('.linear-column')).includes('DOPISEK'),
  `kafelków: ${await ile()}`)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
