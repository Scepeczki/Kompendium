// Test scalonych bloków: źródła składników, wybór ich stron, edycja tytułu
// i przepisanie treści całości, pytanie przy rozdzieleniu.
import { chromium } from 'playwright'
import { nowaSciezka, podaj, potwierdz, anuluj } from './lib.mjs'

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

// klocek 1: treść + strona „Dowód" + źródło z PDF
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Kres gorny')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.type('Najmniejsze ograniczenie gorne zbioru.')
await page.waitForTimeout(400)
await page.click('.subpage-add')
await podaj(page, 'Dowod')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.type('TRESC-DOWODU-KRESU')
await page.waitForTimeout(400)
await page.setInputFiles('input[type=file][accept="application/pdf"]', 'scripts/test.pdf')
await page.waitForSelector('.pdf-page-wrap canvas', { timeout: 20000 })
await page.click('button:has-text("Podepnij źródło")')
const c = await page.locator('.pdf-page-wrap canvas').first().boundingBox()
await page.mouse.move(c.x + 30, c.y + 30)
await page.mouse.down()
await page.mouse.move(c.x + 200, c.y + 90, { steps: 5 })
await page.mouse.up()
await page.waitForSelector('.source-chip')
await page.waitForTimeout(400)
await page.click('.btn-close[title*="Zamknij klocek"]')

// klocek 2
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Notacja kresu')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.type('Piszemy sup A.')
await page.waitForTimeout(400)
await page.click('.btn-close[title*="Zamknij klocek"]')

await nowaSciezka(page, 'Fuzje')
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
for (const n of ['Kres gorny', 'Notacja kresu']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.linear-append')
  await page.waitForTimeout(450)
}

await page.hover('.linear-seg:first-child')
await page.click('.linear-seg:first-child .folder-action[title*="Scal z następnym"]')
await podaj(page, 'Kres gorny i jego notacja')
await page.waitForSelector('.script-group-block')
await page.waitForTimeout(700)

// 1. źródła składników widać w scalonym bloku
const zrodla = await page.evaluate(() => {
  const g = document.querySelector('.script-group-block')
  return {
    lista: !!g.querySelector('.source-list'),
    ile: g.querySelector('.source-list-count')?.textContent ?? '0',
  }
})
check('scalony blok pokazuje źródła składników', zrodla.lista && zrodla.ile === '1',
  JSON.stringify(zrodla))

// 2. strony składników do wyboru w środku grupy
const chipy = await page.locator('.script-group-block .group-part-pages .page-chip').allTextContents()
check('w grupie da się wybrać stronę składnika',
  chipy.includes('Dowod') && chipy.includes('Treść'), chipy.join(' · '))
await page.click('.script-group-block .group-part-pages .page-chip:has-text("Dowod")')
await page.waitForTimeout(600)
check('wybrana strona zmienia pokazywaną treść',
  (await page.textContent('.script-group-block')).includes('TRESC-DOWODU-KRESU'))

// 3. edycja tytułu grupy
await page.hover('.linear-seg:first-child')
const pud = await page.locator('.linear-seg:first-child').boundingBox()
await page.mouse.click(pud.x + pud.width / 2, pud.y + 6, { button: 'right' })
await page.waitForSelector('.linear-menu')
await page.click('.linear-menu .tree-menu-item:has-text("Czym to jest")')
await page.waitForSelector('.group-editor')
await page.fill('.group-editor .settings-row:has-text("Nazwa w tej ścieżce") input', 'Kres i notacja')
await page.waitForTimeout(400)
check('tytuł grupy da się zmienić',
  (await page.inputValue('.script-group-block .inline-title')) === 'Kres i notacja')

// 4. przepisanie treści całości
await page.click('.group-editor button:has-text("Przepisz na jeden tekst")')
await page.waitForSelector('.group-content')
const zalazek = await page.inputValue('.group-content')
check('przepisywanie startuje od sklejonych treści składników',
  zalazek.includes('TRESC-DOWODU-KRESU') && zalazek.includes('Piszemy sup A'), zalazek)
await page.fill('.group-content', 'Kresem gornym zbioru A, pisanym sup A, nazywamy PRZEPISANE.')
await page.waitForTimeout(500)
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
const tresc = await page.textContent('.script-group-block')
check('grupa pokazuje przepisaną treść', tresc.includes('PRZEPISANE'))
check('a nie treści składników', !tresc.includes('TRESC-DOWODU-KRESU'))
check('źródła zostają mimo przepisania',
  (await page.locator('.script-group-block .source-list').count()) === 1)

// 5. przepisana treść przeżywa przeładowanie
await page.reload()
await page.waitForSelector('.concept-item')
await page.click('.concept-item:has-text("Fuzje")')
await page.waitForSelector('.script-group-block')
await page.waitForTimeout(700)
check('przepisana treść zapamiętana',
  (await page.textContent('.script-group-block')).includes('PRZEPISANE'))

// 6. rozdzielenie pyta, bo treść była przepisana
await page.hover('.linear-seg:first-child')
await page.click('.linear-seg:first-child .folder-action[title*="Rozdziel"]')
await page.waitForSelector('.ask-dialog')
const pytanie = await page.textContent('.ask-dialog')
check('rozdzielenie ostrzega o utracie przepisanego tekstu',
  pytanie.includes('przepisan'), pytanie.slice(0, 90))
await anuluj(page)
check('anulowanie zostawia grupę',
  (await page.locator('.script-group-block').count()) === 1)

// 7. potwierdzone rozdzielenie zszywa łańcuch
await page.hover('.linear-seg:first-child')
await page.click('.linear-seg:first-child .folder-action[title*="Rozdziel"]')
await potwierdz(page)
await page.waitForTimeout(900)
const poRozdzieleniu = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const r = req.result.transaction('paths', 'readonly').objectStore('paths').getAll()
  await new Promise((res) => (r.onsuccess = res))
  const p = r.result.find((x) => x.name === 'Fuzje')
  const wejscia = new Map(p.nodes.map((n) => [n.id, 0]))
  for (const e of p.edges) wejscia.set(e.to, (wejscia.get(e.to) ?? 0) + 1)
  return {
    wezly: p.nodes.length,
    strzalki: p.edges.length,
    bezWejscia: [...wejscia.values()].filter((v) => v === 0).length,
  }
})
check('po rozdzieleniu wracają dwa kafelki spięte w ciąg',
  poRozdzieleniu.wezly === 2 && poRozdzieleniu.strzalki === 1 &&
    poRozdzieleniu.bezWejscia === 1,
  JSON.stringify(poRozdzieleniu))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
