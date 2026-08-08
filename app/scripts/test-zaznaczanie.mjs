// Test zaznaczania wielu rzeczy w liście i przenoszenia ich grupowo,
// plus dwa drobiazgi: przycisk wzoru i puste linie w ścieżce.
import { chromium } from 'playwright'
import { nowaSciezka, nowyFolder } from './lib.mjs'

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

for (const n of ['Alfa', 'Beta', 'Gamma', 'Delta']) {
  await page.click('.sidebar-create-btn[title="Nowy klocek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.waitForTimeout(200)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}
await nowyFolder(page, 'Worek')

// 1. Ctrl+klik dokłada do zaznaczenia i nie otwiera klocka
await page.click('.concept-item:has-text("Alfa")', { modifiers: ['Control'] })
await page.click('.concept-item:has-text("Gamma")', { modifiers: ['Control'] })
await page.waitForTimeout(300)
check('Ctrl+klik zaznacza wiele klocków',
  (await page.locator('.concept-item.zaznaczony').count()) === 2,
  `${await page.locator('.concept-item.zaznaczony').count()}`)
check('Ctrl+klik nie otwiera klocka',
  (await page.locator('.editor-name').count()) === 0)

// 2. przeciągnięcie jednego z zaznaczonych przenosi wszystkie
await page.dragAndDrop('.concept-item:has-text("Alfa")', '.folder-row:has-text("Worek")')
await page.waitForTimeout(900)
const wFolderze = await page.evaluate(() => {
  const ul = document.querySelector('.folder-children')
  return ul ? [...ul.querySelectorAll('.concept-name')].map((n) => n.textContent) : []
})
check('przeciągnięcie zaznaczenia przenosi całą grupę',
  wFolderze.includes('Alfa') && wFolderze.includes('Gamma') && wFolderze.length === 2,
  wFolderze.join(' | '))
check('po przeniesieniu zaznaczenie znika',
  (await page.locator('.zaznaczony').count()) === 0)

// 3. Shift+klik bierze zakres
await page.click('.concept-item:has-text("Beta")')
await page.waitForTimeout(300)
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.click('.concept-item:has-text("Beta")')
await page.waitForTimeout(200)
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.click('.concept-item:has-text("Delta")', { modifiers: ['Shift'] })
await page.waitForTimeout(300)
const zakres = await page.locator('.zaznaczony').count()
check('Shift+klik bierze cały zakres', zakres >= 2, `zaznaczonych: ${zakres}`)

// 4. zwykły klik czyści zaznaczenie i otwiera klocek
await page.click('.concept-item:has-text("Beta")')
await page.waitForSelector('.editor-name')
check('zwykły klik czyści zaznaczenie i otwiera klocek',
  (await page.locator('.zaznaczony').count()) === 0)

// 5. przycisk wzoru wstawia pustą parę z kursorem w środku
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForSelector('.rich-content .tiptap')
await page.click('.rich-content .tiptap')
await page.keyboard.press('Control+a')
await page.keyboard.press('Delete')
await page.click('button[title*="Wzór w tekście"]')
await page.keyboard.type('a^2')
await page.waitForTimeout(600)
await page.click('.view-switch button:has-text("Kod")')
await page.waitForTimeout(500)
const kod = await page.textContent('.editor-code .cm-content')
check('przycisk wzoru daje pustą parę, a nie literalne „x"',
  kod.includes('$a^2$') && !kod.includes('x$'), kod)

// 6. puste linie z klocka widać w ścieżce
await page.click('.editor-code .cm-content')
await page.keyboard.press('Control+a')
await page.keyboard.type('Pierwszy.\n\n\n\nDrugi po dwoch pustych.')
await page.waitForTimeout(700)
await page.click('.btn-close[title*="Zamknij klocek"]')
await nowaSciezka(page, 'Odstepy')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
await page.dragAndDrop('.concept-item:has-text("Beta")', '.linear-append')
await page.waitForTimeout(800)
const akapity = await page.evaluate(() =>
  [...document.querySelectorAll('.linear-seg .markdown-body > p')].length,
)
check('puste linie z klocka widać w ścieżce', akapity === 4,
  `akapitów w segmencie: ${akapity} (oczekiwane 4: tekst, dwie przerwy, tekst)`)

// 7. zaznaczanie i przenoszenie grupowe w Linii
for (const n of ['Alfa', 'Gamma', 'Delta']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(450)
}
const nazwyLinii = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.linear-seg')].map((s) =>
      (s.querySelector('.script-block-title')?.textContent ?? '').replace(/^\S+:\s*/, '').trim(),
    ),
  )
const przedLinia = await nazwyLinii()
await page.click('.linear-seg:nth-child(3)', { modifiers: ['Control'] })
await page.click('.linear-seg:nth-child(4)', { modifiers: ['Control'] })
await page.waitForTimeout(300)
check('Ctrl+klik zaznacza segmenty w Linii',
  (await page.locator('.linear-seg.zaznaczony').count()) === 2,
  `${await page.locator('.linear-seg.zaznaczony').count()}`)

// przeciągnij uchwyt jednego z zaznaczonych na sam początek
const uchwyt = await page.locator('.linear-seg:nth-child(3) .linear-grip').boundingBox()
const cel = await page.locator('.linear-seg:first-child').boundingBox()
await page.mouse.move(uchwyt.x + 5, uchwyt.y + 5)
await page.mouse.down()
await page.mouse.move(cel.x + 60, cel.y + 4, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(900)
const poLinii = await nazwyLinii()
check('przeciągnięcie zaznaczenia przenosi wszystkie segmenty',
  poLinii.length === przedLinia.length &&
    poLinii[0] === przedLinia[2] && poLinii[1] === przedLinia[3],
  `${przedLinia.join(' | ')}  ⟶  ${poLinii.join(' | ')}`)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
