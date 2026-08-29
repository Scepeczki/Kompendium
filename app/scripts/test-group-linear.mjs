// Test scalania kafelków w widoku Linia: przycisk ⧉ scala segment z następnym,
// kolejne kliknięcia dokładają następne kafelki do tej samej grupy.
import { chromium } from 'playwright'
import { nazwij, podaj, zloz } from './lib.mjs'

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

const answers = ['Kresy zbiorow']
page.on('dialog', (d) => d.accept(answers.shift() ?? 'X'))

const settle = () => page.waitForTimeout(900)
const readGroups = () =>
  page.evaluate(async () => {
    const req = indexedDB.open('kompendium')
    await new Promise((res) => (req.onsuccess = res))
    const tx = req.result.transaction(['paths', 'concepts'], 'readonly')
    const ps = await new Promise((res) => {
      const r = tx.objectStore('paths').getAll()
      r.onsuccess = () => res(r.result)
    })
    const cs = await new Promise((res) => {
      const r = tx.objectStore('concepts').getAll()
      r.onsuccess = () => res(r.result)
    })
    const nm = (i) => cs.find((c) => c.id === i)?.name
    const p = ps[0]
    return {
      wezly: p.nodes.map((n) => n.kind),
      grupy: p.nodes
        .filter((n) => n.kind === 'fusion')
        .map((n) => ({ nazwa: n.name, typ: n.type ?? null, czesci: n.parts.map((x) => nm(x.conceptId)) })),
    }
  })

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

for (const n of ['Kres gorny', 'Kres dolny', 'Supremum ciagu']) {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', n)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(`Tresc: ${n}.`)
  await page.waitForTimeout(400)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}

await page.click('button[title*="Nowa ścieżka"]')
await nazwij(page, "Sciezka")
await page.waitForSelector('.path-canvas')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Kres gorny', 'Kres dolny', 'Supremum ciagu']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(500)
}
await settle()

// 1. przycisk scalania jest przy segmentach, które mają następnika
const buttons = await page.evaluate(() =>
  [...document.querySelectorAll('.linear-seg')].map(
    (s) => !!s.querySelector('.folder-action[title*="Scal z następnym"]'),
  ),
)
check('przycisk ⧉ przy segmentach z następnikiem (ostatni bez)',
  buttons.length === 3 && buttons[0] && buttons[1] && !buttons[2],
  JSON.stringify(buttons))

// 2. scalenie pierwszego z drugim
await page.hover('.linear-seg:first-child')
await page.click('.linear-seg:first-child .folder-action[title*="Scal z następnym"]')
await zloz(page, 'Kresy zbiorow')
await settle()
let st = await readGroups()
check('scalenie w Linii tworzy grupę z dwóch kafelków',
  st.grupy.length === 1 && st.grupy[0].czesci.length === 2,
  JSON.stringify(st.grupy[0]))
check('grupa ma nazwę podaną w oknie', st.grupy[0]?.nazwa === 'Kresy zbiorow',
  `nazwa: ${st.grupy[0]?.nazwa}`)
check('kolejność części zachowana', st.grupy[0]?.czesci.join(' + ') === 'Kres gorny + Kres dolny',
  st.grupy[0]?.czesci.join(' + '))
check('typ przejęty z jednakowych kafelków', st.grupy[0]?.typ === 'definicja',
  `typ: ${st.grupy[0]?.typ}`)

// 3. grupa widoczna w Linii jako jeden blok
const segs = await page.evaluate(() =>
  [...document.querySelectorAll('.linear-seg')].map((s) =>
    s.querySelector('.script-group-block') ? 'grupa' : 'blok',
  ),
)
check('Linia pokazuje grupę i pozostały kafelek', segs.join(',') === 'grupa,blok', segs.join(','))

// 4. dołożenie trzeciego kafelka — nazwa zostaje, materiał rośnie
await page.hover('.linear-seg:first-child')
await page.click('.linear-seg:first-child .folder-action[title*="Dołącz następny"]')
await zloz(page)
await settle()
st = await readGroups()
check('dołączenie następnego kafelka do grupy',
  st.grupy[0]?.czesci.length === 3, JSON.stringify(st.grupy[0]?.czesci))
check('nazwa grupy bez zmian po dołączeniu', st.grupy[0]?.nazwa === 'Kresy zbiorow',
  `nazwa: ${st.grupy[0]?.nazwa}`)
check('w ścieżce został jeden segment', st.wezly.filter((k) => k === 'block').length === 0,
  `węzły: ${st.wezly.join(',')}`)

// 5. nazwa i rodzaj — na ekranie komponowania, nie w osobnym okienku
await page.hover('.linear-seg:first-child')
const pud = await page.locator('.linear-seg:first-child').boundingBox()
await page.mouse.click(pud.x + pud.width / 2, pud.y + 6, { button: 'right' })
await page.waitForSelector('.linear-menu')
await page.click('.linear-menu .tree-menu-item:has-text("Komponuj")')
await page.waitForSelector('.komp-okno')
check('do komponowania wraca się z menu', true)
await page.fill('.komp-nazwa', 'Kresy i supremum')
await page.selectOption('.komp-typ-select', 'twierdzenie')
await page.waitForTimeout(400)
await page.click('.komp-head button:has-text("Gotowe")')
await settle()
st = await readGroups()
check('zmiana nazwy z ekranu komponowania', st.grupy[0]?.nazwa === 'Kresy i supremum',
  `nazwa: ${st.grupy[0]?.nazwa}`)
check('zmiana rodzaju z ekranu komponowania', st.grupy[0]?.typ === 'twierdzenie',
  `typ: ${st.grupy[0]?.typ}`)
const naglowek = await page.evaluate(() => {
  const g = document.querySelector('.script-group-block')
  const typ = g?.querySelector('.script-block-type')?.textContent?.trim() ?? ''
  const nazwa = g?.querySelector('.inline-title')?.value ?? ''
  return `${typ} ${nazwa}`.trim()
})
check('nagłówek grupy odzwierciedla nowy typ i nazwę',
  naglowek?.startsWith('Twierdzenie:') && naglowek.includes('Kresy i supremum'),
  naglowek)

// 6. rozgrupowanie w Linii
await page.hover('.linear-seg:first-child')
await page.click('.linear-seg:first-child .folder-action[title*="Rozdziel"]')
await settle()
st = await readGroups()
check('rozgrupowanie w Linii przywraca osobne kafelki',
  st.grupy.length === 0 && st.wezly.filter((k) => k === 'block').length === 3,
  `węzły: ${st.wezly.join(',')}`)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
