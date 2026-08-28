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

// 2a. scalenie daje JEDEN tekst
//
// Kafelek bez stron nie zostawia po sobie żadnego śladu: żadnych pasków,
// żadnych okienek „dodaj stronę". Tekst przerywa się wyłącznie tam, gdzie
// zaczyna się kafelek, który strony naprawdę ma — bo tylko tam jest z czego
// wybierać. „Kres gorny" ma stronę „Dowod", „Notacja kresu" nie ma żadnej.
check('scalony blok nie ma żadnych okienek na stawianie pasków',
  (await page.locator('.script-group-block .group-dodaj-pasek').count()) === 0)
check('kafelek ze stronami przerywa tekst w swoim miejscu — i tylko on',
  (await page.locator('.script-group-block .group-pasek').count()) === 1,
  `pasków ${await page.locator('.script-group-block .group-pasek').count()}`)
const domyslne = await page.locator('.script-group-block .group-pasek').innerText()
check('i to ten pasek pokazuje strony tego kafelka',
  domyslne.includes('Treść') && domyslne.includes('Dowod'), domyslne.replace(/s+/g, ' '))

// 2b. dopiero z paska wybiera się stronę składnika
await page.click('.group-pasek .block-page:has-text("Dowod")')
await page.waitForTimeout(600)
check('wybrana strona zmienia pokazywaną treść',
  (await page.textContent('.script-group-block')).includes('TRESC-DOWODU-KRESU'))

// 2c. pasek nie musi stać na granicy kafelków — wchodzi w środek tekstu
await page.click('.script-group-block .linear-pole .tiptap')
await page.waitForTimeout(300)
await page.keyboard.press('Control+End')
await page.keyboard.press('Enter')
await page.keyboard.type('DRUGI AKAPIT skladnika.')
await page.waitForTimeout(900)
const polaPrzed = await page.locator('.script-group-block .linear-pole').count()
await page.locator('.script-group-block .tiptap p:has-text("TRESC-DOWODU-KRESU")').first()
  .click({ button: 'right' })
await page.waitForSelector('.linear-menu')
check('menu proponuje pasek w tym miejscu tekstu',
  (await page.locator('.linear-menu .tree-menu-item:has-text("Pasek stron w tym miejscu")').count()) === 1)
await page.click('.linear-menu .tree-menu-item:has-text("Pasek stron w tym miejscu")')
await page.waitForTimeout(900)
check('pasek staje w środku tekstu składnika',
  (await page.locator('.script-group-block .group-part .group-pasek').count()) === 1)
check('a tekst rozcina się na dwa pola',
  (await page.locator('.script-group-block .linear-pole').count()) === polaPrzed + 1,
  `${polaPrzed} → ${await page.locator('.script-group-block .linear-pole').count()}`)
const rozciety = await page.textContent('.script-group-block')
check('żaden kawałek tekstu nie ginie przy rozcięciu',
  rozciety.includes('TRESC-DOWODU-KRESU') && rozciety.includes('DRUGI AKAPIT skladnika'))

// 2d. zakładki przenosi się przeciągnięciem między paskami
await page.locator('.group-pasek .group-zakladki').first().dragTo(
  page.locator('.script-group-block .group-pasek').last(),
)
await page.waitForTimeout(700)
check('zakładka daje się przenieść między paskami',
  (await page.locator('.group-pasek').last().locator('.group-zakladki').count()) === 1 &&
    (await page.locator('.group-pasek-pusty').count()) === 1,
  `zakładek ${await page.locator('.group-pasek .group-zakladki').count()}`)

// 2e. …albo z listy pod prawym przyciskiem, bez celowania myszą
await page.locator('.script-group-block .group-pasek').first().click({ button: 'right' })
await page.waitForSelector('.tree-menu-item:has-text("Wstaw zakładkę")')
await page.click('.tree-menu-item:has-text("Wstaw zakładkę")')
await page.waitForTimeout(250)
const dostepne = await page.locator('.tree-menu-boczne').innerText()
check('menu paska rozwija listę stron scalonych kafelków',
  dostepne.includes('Kres gorny') &&
    dostepne.includes('Dowod') &&
    dostepne.includes('Notacja kresu'),
  dostepne.slice(0, 120))
await page.locator('.tree-menu-boczne .tree-menu-where:has-text("Notacja kresu")')
  .locator('xpath=following-sibling::button[1]')
  .click()
await page.waitForTimeout(700)
check('wybrana z listy zakładka ląduje w pasku',
  (await page.locator('.group-pasek-pusty').count()) === 0,
  `pustych ${await page.locator('.group-pasek-pusty').count()}`)

// 2f. pasek zostaje, choć wyprowadzi się z niego wszystko…
await page.locator('.script-group-block .group-pasek').first().click({ button: 'right' })
await page.waitForSelector('.tree-menu-item:has-text("Opróżnij pasek")')
await page.click('.tree-menu-item:has-text("Opróżnij pasek")')
await page.waitForTimeout(600)
check('opróżniony pasek zostaje na miejscu',
  (await page.locator('.group-pasek-pusty').count()) === 1)

// …i dopiero skasowanie zrasta tekst z powrotem
const przedUsunieciem = await page.locator('.script-group-block .group-pasek').count()
await page.locator('.script-group-block .group-pasek').first().click({ button: 'right' })
await page.waitForSelector('.tree-menu-item:has-text("Usuń ten pasek")')
await page.click('.tree-menu-item:has-text("Usuń ten pasek")')
await page.waitForTimeout(700)
check('skasowany pasek znika i tekst jest znów ciągły',
  (await page.locator('.script-group-block .group-pasek').count()) === przedUsunieciem - 1,
  `${przedUsunieciem} → ${await page.locator('.script-group-block .group-pasek').count()}`)
const poUsunieciu = await page.textContent('.script-group-block')
check('i nic po drodze nie ginie',
  poUsunieciu.includes('TRESC-DOWODU-KRESU') && poUsunieciu.includes('DRUGI AKAPIT skladnika'))


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
// …łącznie z tym, co dopisane przy składniku w tej ścieżce
check('przepisywanie nie gubi tekstu dopisanego w ścieżce',
  zalazek.includes('DRUGI AKAPIT skladnika'), zalazek.slice(0, 120))
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
