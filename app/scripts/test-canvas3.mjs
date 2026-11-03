// Test: komentarze do ścieżki, menu kafelka, zarządzanie wersjami kafelka.
import { chromium } from 'playwright'
import { nazwij, podaj, potwierdz } from './lib.mjs'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const answers = []
page.on('dialog', (d) => d.accept(answers.shift() ?? ''))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// --- WERSJE KAFELKA ---
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Pojęcie W')

// brak „Intuicja" w wyborze typów
const typeOptions = await page.$$eval('.type-select option', (os) =>
  os.map((o) => o.textContent),
)
console.log(
  `✓ typy bez Intuicji: ${typeOptions.includes('Intuicja') ? 'BŁĄD — jest!' : 'ok'} (${typeOptions.join(', ')})`,
)

// zmień etykietę v1 (pigułka pokazuje samą etykietę, bez przedrostka v1)
await page.click('.version-action[title*="etykietę"]')
await podaj(page, 'pierwotna')
await page.waitForSelector('.version-pill:has-text("pierwotna")')
const pillText = await page.textContent('.version-pill:not(.new)')
console.log(
  `✓ etykieta bez przedrostka: "${pillText.trim()}" ${pillText.includes('v1') ? '— BŁĄD, jest v1!' : ''}`,
)

// nowa wersja z etykietą
await page.click('button.version-pill.new')
await podaj(page, 'druga')
await page.waitForSelector('.version-pill.active:has-text("druga")')
console.log('✓ nowa wersja „druga"')

// zmiana kolejności: przeciągnij „druga" przed „pierwotna" → numeracja się odwraca
await page.dragAndDrop(
  '.version-pill:has-text("druga")',
  '.version-pill:has-text("pierwotna")',
  { targetPosition: { x: 8, y: 10 } },
)
await page.waitForFunction(() => {
  const p = document.querySelector('.version-pill:not(.new)')
  return p && p.title.startsWith('wersja 1 — druga')
})
console.log('✓ kolejność wersji zmieniona przeciąganiem (druga jest teraz wersją 1)')

// usuń pokazywaną wersję (aktywna = druga); zostaje pierwotna jako wersja 1
await page.click('.version-action[title*="Usuń tę wersję"]')
await potwierdz(page)
await page.waitForFunction(() => {
  const pills = document.querySelectorAll('.version-pill:not(.new)')
  return pills.length === 1 && pills[0].title.startsWith('wersja 1 — pierwotna')
})
const pills = await page.locator('.version-pill:not(.new)').count()
console.log(`✓ usuwanie wersji działa (zostało pigułek: ${pills})`)
await page.click('.btn-close[title*="Zamknij kafelek"]')

// --- KOMENTARZE I MENU KAFELKA NA ŚCIEŻCE ---
await page.click('button[title*="Nowa ścieżka"]')
await nazwij(page, "Ścieżka")
await page.waitForSelector('.path-canvas')
const flow = await page.locator('.path-flow').boundingBox()

// komentarz przez prawy przycisk + edycja w oknie
await page.mouse.click(flow.x + flow.width * 0.4, flow.y + flow.height * 0.25, {
  button: 'right',
})
await page.waitForSelector('.path-ctxmenu')
await page.click('text=Nowy komentarz tutaj')
await page.waitForSelector('.path-node-comment')
await page.dblclick('.path-node-comment .path-node-notebody')
await page.waitForSelector('.note-modal .rich-content .tiptap')
await page.click('.note-modal .rich-content .tiptap')
await page.keyboard.type('KOMENTARZ-META o ścieżce')
await page.waitForTimeout(600)
await page.click('.note-modal .btn-close')
await page.waitForSelector('.path-node-comment:has-text("KOMENTARZ-META")')
console.log('✓ komentarz utworzony i edytowany w oknie')

// kafelek na mapie + skrypt: komentarz NIE wchodzi do skryptu
await page.mouse.click(flow.x + flow.width * 0.4, flow.y + flow.height * 0.7, {
  button: 'right',
})
await page.waitForSelector('.path-ctxmenu')
await page.click('.path-ctxmenu .dodaj-kafelek > button')
await page.waitForSelector('.path-node-head')
await page.waitForTimeout(800) // autozapis ścieżki
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-embed')
await page.waitForSelector('.script-block')
const blocks = await page.locator('.script-block').count()
const metaInScript = await page.locator('.script-embed :text("KOMENTARZ-META")').count()
console.log(
  `✓ skrypt: bloki=${blocks}, komentarz w skrypcie: ${metaInScript === 0 ? 'nie (dobrze)' : 'TAK — BŁĄD'}`,
)
await page.click('.view-switch button:has-text("Mapa")')

// menu kafelka: prawy przycisk na komentarzu → Usuń ze ścieżki
await page.click('.path-node-comment .path-node-grip', { button: 'right' })
await page.waitForSelector('.path-ctxmenu')
await page.click('text=Usuń ze ścieżki')
await page.waitForFunction(() => !document.querySelector('.path-node-comment'))
console.log('✓ menu kafelka: usuwanie ze ścieżki działa')

// menu kafelka na kafelku: Edytuj otwiera edytor
await page.click('.path-node-head', { button: 'right' })
await page.waitForSelector('.path-ctxmenu')
await page.click('text=✏ Edytuj kafelek')
await page.waitForSelector('.editor-name')
console.log('✓ menu kafelka: edycja kafelka otwiera edytor')

await page.screenshot({ path: 'scripts/shot-14-canvas3.png' })
console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
