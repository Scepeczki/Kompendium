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

// kafelek 1: treść + strona „Dowód" + źródło z PDF
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
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
await page.click('.btn-close[title*="Zamknij kafelek"]')

// kafelek 2
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Notacja kresu')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.type('Piszemy sup A.')
await page.waitForTimeout(400)
await page.click('.btn-close[title*="Zamknij kafelek"]')

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
const chipy = await page.locator('.script-group-block .group-part-pages .block-page').allTextContents()
check('w grupie da się wybrać stronę składnika',
  chipy.includes('Dowod') && chipy.includes('Treść'), chipy.join(' · '))
await page.click('.script-group-block .group-part-pages .block-page:has-text("Dowod")')
await page.waitForTimeout(600)
check('wybrana strona zmienia pokazywaną treść',
  (await page.textContent('.script-group-block')).includes('TRESC-DOWODU-KRESU'))

// 2a. paski stron w scalonym bloku — ustawienia TEJ ŚCIEŻKI
//
// Scalone kafelki mają czytać się jak jedna całość, a napis „Treść" nad
// każdą częścią rozbija to na kawałki. Pod prawym przyciskiem: schować,
// zebrać w jeden rząd, przenieść, przemianować. Kafelki w bibliotece
// zostają przy tym nietknięte.
await page.locator('.script-group-block .group-part-pages').first().click({ button: 'right' })
await page.waitForSelector('.tree-menu-where:has-text("Paski stron")')
const menuPaska = (await page.locator('.tree-menu-item').allTextContents()).join(' | ')
check('pasek stron ma menu pod prawym przyciskiem',
  menuPaska.includes('Schowaj paski') && menuPaska.includes('jeden rząd') &&
    menuPaska.includes('Zmień podpis'),
  menuPaska)

await page.click('.tree-menu-item:has-text("Zbierz w jeden rząd")')
await page.waitForTimeout(600)
check('paski dają się zebrać w jeden rząd',
  (await page.locator('.group-paski-rzad').count()) === 1)

await page.locator('.group-paski-rzad .group-part-pages').first().click({ button: 'right' })
await page.waitForSelector('.tree-menu-item:has-text("Przenieś na dół")')
await page.click('.tree-menu-item:has-text("Przenieś na dół")')
await page.waitForTimeout(600)
// rząd ma teraz stać POD treścią składników
const naDole = await page.evaluate(() => {
  const blok = document.querySelector('.script-group-block')
  const rzad = blok.querySelector('.group-paski-rzad')
  const tresc = blok.querySelector('.group-part')
  return rzad && tresc ? rzad.getBoundingClientRect().top > tresc.getBoundingClientRect().top : false
})
check('rząd pasków da się przenieść pod treść', naDole)

await page.locator('.group-paski-rzad .group-part-pages').first().click({ button: 'right' })
await page.waitForSelector('.tree-menu-item:has-text("Schowaj paski")')
await page.click('.tree-menu-item:has-text("Schowaj paski")')
await page.waitForTimeout(600)
check('paski da się schować zupełnie',
  (await page.locator('.script-group-block .group-part-pages').count()) === 0)

// schowane paski trzeba dać się odzyskać — inaczej nie ma czego kliknąć
check('po schowaniu zostaje uchwyt do odzyskania pasków',
  (await page.locator('.group-paski-uchwyt').count()) === 1)
await page.click('.group-paski-uchwyt')
await page.waitForSelector('.tree-menu-item:has-text("Pokaż paski")')
await page.click('.tree-menu-item:has-text("Pokaż paski")')
await page.waitForTimeout(600)
check('paski wracają', (await page.locator('.group-part-pages').count()) > 0)

// podpis paska — „Treść" bywa złym słowem w scalonym bloku
await page.locator('.group-part-pages').first().click({ button: 'right' })
await page.waitForSelector('.tree-menu-item:has-text("Zmień podpis")')
await page.click('.tree-menu-item:has-text("Zmień podpis")')
await page.waitForSelector('.ask-input')
await page.fill('.ask-input', 'Sformułowanie')
await page.click('.ask-foot .btn:last-child')
await page.waitForTimeout(700)
check('podpis paska da się zmienić w tej ścieżce',
  (await page.locator('.script-group-block').first().innerText()).includes('Sformułowanie'))

// …ale nazwa strony w bibliotece ma zostać nietknięta
await page.click('.concept-item:has-text("Kres gorny")')
await page.waitForSelector('.editor-name')
await page.waitForTimeout(600)
check('nazwa strony w bibliotece bez zmian',
  !(await page.locator('.editor-body').innerText()).includes('Sformułowanie'))
await page.click('.concept-item:has-text("Fuzje")')
await page.waitForSelector('.script-group-block')
await page.waitForTimeout(700)

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
await page.waitForTimeout(500)
await page.keyboard.press('Escape')
await page.waitForTimeout(700)
await page.click('.script-group-block .markdown-body')
await page.waitForSelector('.script-group-block .linear-pole')
const zalazek = await page.textContent('.script-group-block .linear-pole')
check('przepisywanie startuje od sklejonych treści składników',
  zalazek.includes('TRESC-DOWODU-KRESU') && zalazek.includes('Piszemy sup A'), zalazek)
// dalej pisze się już wprost w kafelku
await page.click('.script-group-block .linear-pole .tiptap')
await page.keyboard.press('Control+a')
await page.keyboard.type('Kresem gornym zbioru A, pisanym sup A, nazywamy PRZEPISANE.')
await page.waitForTimeout(900)
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
