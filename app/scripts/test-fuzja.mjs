// Test złożonego kafelka w ścieżce: źródła przeniesione z materiałów, nazwa
// i rodzaj z ekranu komponowania, pisanie wprost w bloku (biblioteka
// nietknięta) i rozdzielenie, które nie gubi złożonego tekstu.
import { chromium } from 'playwright'
import { nowaSciezka, podaj, potwierdz, anuluj, zloz } from './lib.mjs'

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
await zloz(page, 'Kres gorny i jego notacja')
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

// 2z. żadnych pudełek: scalony blok ma wyglądać jak jeden tekst
await page.click('.script-group-block .linear-pole .tiptap')
await page.waitForTimeout(500)
const pudelka = await page.evaluate(() => {
  const g = document.querySelector('.script-group-block')
  const przezroczysty = (c) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent'
  const pola = [...g.querySelectorAll('.linear-pole .tiptap')].map((e) => {
    const st = getComputedStyle(e)
    return { ramka: przezroczysty(st.borderTopColor), ognisko: e.classList.contains('ProseMirror-focused') }
  })
  const obrys = [...g.querySelectorAll('.group-part')].map(
    (e) => getComputedStyle(e).outlineStyle,
  )
  return { pola, obrys }
})
check('w bloku nie ma już żadnych „składników" do obrysowania',
  pudelka.obrys.length === 0, pudelka.obrys.join(', '))
check('ani ramki wokół pola, w którym się pisze',
  pudelka.pola.length > 0 && pudelka.pola.every((p) => p.ramka),
  JSON.stringify(pudelka.pola))

// 2. nazwa i rodzaj — na ekranie komponowania, nie w osobnym okienku
await page.hover('.linear-seg:first-child')
const pud = await page.locator('.linear-seg:first-child').boundingBox()
await page.mouse.click(pud.x + pud.width / 2, pud.y + 6, { button: 'right' })
await page.waitForSelector('.linear-menu')
await page.click('.linear-menu .tree-menu-item:has-text("Komponuj")')
await page.waitForSelector('.komp-okno')
await page.fill('.komp-nazwa', 'Kres i notacja')
await page.selectOption('.komp-typ-select', 'twierdzenie')
await page.waitForTimeout(400)
await page.click('.komp-head button:has-text("Gotowe")')
await page.waitForTimeout(800)
check('nazwa nadana w komponowaniu widać w ścieżce',
  (await page.inputValue('.script-group-block .inline-title')) === 'Kres i notacja')
check('i rodzaj też', (await page.textContent('.script-group-block .script-block-type')).includes('Twierdzenie'))

// 3. w złożonym kafelku pisze się wprost, a biblioteka zostaje nietknięta
await page.click('.script-group-block .linear-pole .tiptap, .script-group-block .markdown-body')
await page.waitForSelector('.script-group-block .linear-pole .tiptap')
await page.click('.script-group-block .linear-pole .tiptap')
await page.keyboard.press('Control+End')
await page.keyboard.type(' DOPISANE-W-ZLOZONYM')
await page.waitForTimeout(1200)
check('tekst dopisany w złożonym kafelku widać',
  (await page.textContent('.script-group-block')).includes('DOPISANE-W-ZLOZONYM'))
const wersjeBazy = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  const db = await new Promise((res) => {
    req.onsuccess = () => res(req.result)
  })
  return await new Promise((res) => {
    const r = db.transaction('versions').objectStore('versions').getAll()
    r.onsuccess = () => res(r.result.map((v) => v.content))
  })
})
check('a kafelki w bibliotece tego nie dostały',
  !wersjeBazy.some((c) => c.includes('DOPISANE-W-ZLOZONYM')),
  wersjeBazy.map((c) => c.slice(0, 30)).join(' | '))

// 4. przeżywa przeładowanie
await page.reload()
await page.waitForSelector('.concept-item')
await page.click('.concept-item:has-text("Fuzje")')
await page.waitForSelector('.script-group-block')
await page.waitForTimeout(800)
check('złożony tekst zapamiętany',
  (await page.textContent('.script-group-block')).includes('DOPISANE-W-ZLOZONYM'))
check('źródła materiałów widać dalej',
  (await page.locator('.script-group-block .source-list').count()) === 1)


// 5. rozdzielenie pyta, bo jest co stracić — i tekst zostaje jako notatka
await page.hover('.linear-seg:first-child')
await page.click('.linear-seg:first-child .folder-action[title*="Rozdziel"]')
await page.waitForSelector('.ask-dialog')
const pytanie = await page.textContent('.ask-dialog')
check('rozdzielenie uprzedza, co się stanie ze złożonym tekstem',
  pytanie.includes('notatk'), pytanie.slice(0, 120))
await anuluj(page)
check('anulowanie zostawia złożony kafelek',
  (await page.locator('.script-group-block').count()) === 1)

// 6. potwierdzone rozdzielenie zszywa łańcuch
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
check('po rozdzieleniu wracają kafelki i notatka ze złożonym tekstem, spięte w ciąg',
  poRozdzieleniu.wezly === 3 && poRozdzieleniu.strzalki === 2 &&
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
