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

// 2a. paski stron w scalonym bloku — każdy osobno, wszystko w tej ścieżce
//
// Scalone kafelki mają czytać się jak jedna całość, a napis „Treść" nad
// każdą częścią rozbija to na kawałki. Chowa się więc pasek po pasku,
// pojedynczą stronę też, a rzędy wspólnych zakładek buduje przeciąganie.
// prawym na samą zakładkę — wtedy widać obie możliwości naraz
await page.locator('.script-group-block .block-page').first().click({ button: 'right' })
await page.waitForSelector('.tree-menu-where:has-text("Pasek stron")')
const menuPaska = (await page.locator('.tree-menu-item').allTextContents()).join(' | ')
check('pasek ma osobno: schowaj pasek i schowaj stronę',
  menuPaska.includes('Schowaj ten pasek') && menuPaska.includes('Schowaj tę stronę'),
  menuPaska)

// pojedyncza strona da się schować — pasek zostaje
const przedStrona = await page.locator('.script-group-block .block-page').count()
await page.click('.tree-menu-item:has-text("Schowaj tę stronę")')
await page.waitForTimeout(600)
check('schowanie strony zdejmuje jedną zakładkę',
  (await page.locator('.script-group-block .block-page').count()) === przedStrona - 1,
  `${przedStrona} → ${await page.locator(".script-group-block .block-page").count()}`)

// schowanie paska dotyczy JEDNEGO paska, nie wszystkich
const przedSchowaniem = await page.locator('.script-group-block .group-part-pages').count()
await page.locator('.script-group-block .group-part-pages').first().click({ button: 'right' })
await page.waitForSelector('.tree-menu-item:has-text("Schowaj ten pasek")')
await page.click('.tree-menu-item:has-text("Schowaj ten pasek")')
await page.waitForTimeout(600)
check('chowa się tylko ten jeden pasek',
  (await page.locator('.script-group-block .group-part-pages').count()) === przedSchowaniem - 1,
  `${przedSchowaniem} → ${await page.locator(".script-group-block .group-part-pages").count()}`)
// schowane MUSI dać się odzyskać — inaczej to droga w jedną stronę
check('gdy coś jest schowane, jest uchwyt do przywrócenia',
  (await page.locator('.group-paski-uchwyt').count()) === 1)
await page.click('.group-paski-uchwyt')
await page.waitForSelector('.tree-menu-item:has-text("Pokaż wszystko")')
await page.click('.tree-menu-item:has-text("Pokaż wszystko")')
await page.waitForTimeout(700)
check('wszystko wraca: paski i schowane strony',
  (await page.locator('.script-group-block .group-part-pages').count()) === 2 &&
    (await page.locator('.script-group-block .block-page').count()) === 2,
  `paski ${await page.locator(".script-group-block .group-part-pages").count()}, zakładki ${await page.locator(".script-group-block .block-page").count()}`)

// podpis paska — „Treść" bywa złym słowem w scalonym bloku
await page.locator('.script-group-block .group-part-pages').first().click({ button: 'right' })
await page.waitForSelector('.tree-menu-item:has-text("Zmień podpis")')
await page.click('.tree-menu-item:has-text("Zmień podpis")')
await page.waitForSelector('.ask-input')
await page.fill('.ask-input', 'Sformułowanie')
await page.click('.ask-foot .btn:last-child')
await page.waitForTimeout(700)
check('podpis paska da się zmienić w tej ścieżce',
  // pasek jest pisany wersalikami przez styl, więc porównujemy bez wielkości
  (await page.locator('.script-group-block').first().innerText())
    .toLowerCase()
    .includes('sformułowanie'))

// …ale nazwa strony w bibliotece ma zostać nietknięta
await page.click('.concept-item:has-text("Kres gorny")')
await page.waitForSelector('.editor-name')
await page.waitForTimeout(600)
check('nazwa strony w bibliotece bez zmian',
  !(await page.locator('.editor-body').innerText()).toLowerCase().includes('sformułowanie'))
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
