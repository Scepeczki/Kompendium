// Test: komentarze do ścieżki, menu kafelka, zarządzanie wersjami klocka.
import { chromium } from 'playwright'

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

// --- WERSJE KLOCKA ---
await page.click('text=+ Nowy klocek')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Pojęcie W')

// brak „Intuicja" w wyborze typów
const typeOptions = await page.$$eval('.type-select option', (os) =>
  os.map((o) => o.textContent),
)
console.log(
  `✓ typy bez Intuicji: ${typeOptions.includes('Intuicja') ? 'BŁĄD — jest!' : 'ok'} (${typeOptions.join(', ')})`,
)

// zmień etykietę v1
answers.push('pierwotna')
await page.click('.version-action[title*="etykietę"]')
await page.waitForSelector('.version-pill:has-text("v1 · pierwotna")')
console.log('✓ zmiana etykiety wersji działa')

// nowa wersja z etykietą
answers.push('druga')
await page.click('button.version-pill.new')
await page.waitForSelector('.version-pill.active:has-text("v2 · druga")')
console.log('✓ nowa wersja v2 · druga')

// zmiana kolejności: przeciągnij v2 przed v1 → numeracja się odwraca
await page.dragAndDrop(
  '.version-pill:has-text("druga")',
  '.version-pill:has-text("pierwotna")',
  { targetPosition: { x: 8, y: 10 } },
)
await page.waitForSelector('.version-pill:has-text("v1 · druga")')
await page.waitForSelector('.version-pill:has-text("v2 · pierwotna")')
console.log('✓ kolejność wersji zmieniona przeciąganiem (druga jest teraz v1)')

// usuń pokazywaną wersję (aktywna = druga); zostaje pierwotna jako v1
answers.push('') // confirm
await page.click('.version-action[title*="Usuń tę wersję"]')
await page.waitForSelector('.version-pill:has-text("v1 · pierwotna")')
const pills = await page.locator('.version-pill:not(.new)').count()
console.log(`✓ usuwanie wersji działa (zostało pigułek: ${pills})`)
await page.click('.btn-close[title*="Zamknij klocek"]')

// --- KOMENTARZE I MENU KAFELKA NA ŚCIEŻCE ---
answers.push('Ścieżka K')
await page.click('button[title*="Nowa ścieżka"]')
await page.waitForSelector('.path-canvas')
const flow = await page.locator('.path-flow').boundingBox()

// komentarz przez prawy przycisk + edycja w oknie
await page.mouse.click(flow.x + flow.width * 0.4, flow.y + flow.height * 0.25, {
  button: 'right',
})
await page.waitForSelector('.path-ctxmenu')
await page.click('text=💬 Nowy komentarz tutaj')
await page.waitForSelector('.path-node-comment')
await page.dblclick('.path-node-comment .path-node-notebody')
await page.waitForSelector('.note-modal .cm-content')
await page.click('.note-modal .cm-content')
await page.keyboard.type('KOMENTARZ-META o ścieżce')
await page.waitForTimeout(600)
await page.click('.note-modal .btn-close')
await page.waitForSelector('.path-node-comment:has-text("KOMENTARZ-META")')
console.log('✓ komentarz utworzony i edytowany w oknie')

// klocek na mapie + skrypt: komentarz NIE wchodzi do skryptu
await page.mouse.click(flow.x + flow.width * 0.4, flow.y + flow.height * 0.7, {
  button: 'right',
})
await page.waitForSelector('.path-ctxmenu')
await page.click('text=🧱 Nowy klocek tutaj')
await page.waitForSelector('.path-node-head')
await page.waitForTimeout(800) // autozapis ścieżki
await page.click('text=📜 Skrypt')
await page.waitForSelector('.script-overlay')
await page.waitForSelector('.script-block')
const blocks = await page.locator('.script-block').count()
const metaInScript = await page.locator('.script-overlay :text("KOMENTARZ-META")').count()
console.log(
  `✓ skrypt: bloki=${blocks}, komentarz w skrypcie: ${metaInScript === 0 ? 'nie (dobrze)' : 'TAK — BŁĄD'}`,
)
await page.click('.script-overlay .btn-close')

// menu kafelka: prawy przycisk na komentarzu → Usuń ze ścieżki
await page.click('.path-node-comment .path-node-grip', { button: 'right' })
await page.waitForSelector('.path-ctxmenu')
await page.click('text=🗑 Usuń ze ścieżki')
await page.waitForFunction(() => !document.querySelector('.path-node-comment'))
console.log('✓ menu kafelka: usuwanie ze ścieżki działa')

// menu kafelka na klocku: Edytuj otwiera edytor
await page.click('.path-node-head', { button: 'right' })
await page.waitForSelector('.path-ctxmenu')
await page.click('text=✏ Edytuj klocek')
await page.waitForSelector('.editor-name')
console.log('✓ menu kafelka: edycja klocka otwiera edytor')

await page.screenshot({ path: 'scripts/shot-14-canvas3.png' })
console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
