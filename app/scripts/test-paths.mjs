// Test Etapu 3: ścieżka na canvasie — kafelki, strzałki, tekst, fuzja, skrypt.
import { chromium } from 'playwright'
import { nazwij, podaj, zloz } from './lib.mjs'

const errors = []
const browser = await chromium.launch({
  executablePath: process.env.KOMP_PRZEGLADARKA ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const answers = ['Przestrzeń metryczna (pełna)']
page.on('dialog', (d) => d.accept(answers.shift() ?? ''))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// dwa kafelki z treścią
for (const [name, content] of [
  ['Metryka', 'Funkcja $d: X \\times X \\to [0,\\infty)$.'],
  ['Przestrzeń', 'Zbiór $X$ z metryką.'],
]) {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.click('.view-switch button:has-text("Podział")')
  await page.click('.cm-content')
  await page.keyboard.type(content)
  await page.waitForTimeout(600)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}

// nowa ścieżka
await page.click('button[title*="Nowa ścieżka"]')
await nazwij(page, "Analiza — wykład 1")
await page.waitForSelector('.path-canvas')
console.log('✓ ścieżka utworzona, canvas otwarty')

// przeciągnij oba kafelki na canvas
await page.dragAndDrop('.concept-item:has-text("Metryka")', '.path-flow', {
  targetPosition: { x: 250, y: 100 },
})
await page.waitForSelector('.path-node:has-text("Metryka")')
await page.dragAndDrop('.concept-item:has-text("Przestrzeń")', '.path-flow', {
  targetPosition: { x: 620, y: 620 },
})
await page.waitForSelector('.path-node:has-text("Przestrzeń")')
console.log('✓ kafelki przeciągnięte z paska bocznego (KaTeX w kafelkach)')

// połącz strzałką: dolny handle Metryki → górny handle Przestrzeni
// (z ponawianiem — pomiary układu bywają chwilowo nieaktualne)
for (let attempt = 1; attempt <= 4; attempt++) {
  const srcHandle = await page
    .locator('.path-node:has-text("Metryka") .react-flow__handle-bottom')
    .boundingBox()
  const dstHandle = await page
    .locator('.path-node:has-text("Przestrzeń") .react-flow__handle-top')
    .boundingBox()
  const sx = srcHandle.x + srcHandle.width / 2
  const sy = srcHandle.y + srcHandle.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 4, sy + 4) // mały ruch nad uchwytem inicjuje łączenie
  await page.mouse.move(dstHandle.x + dstHandle.width / 2, dstHandle.y + dstHandle.height / 2, {
    steps: 12,
  })
  await page.mouse.up()
  await page.waitForTimeout(500)
  if ((await page.locator('.react-flow__edge').count()) > 0) break
  if (attempt === 4) throw new Error('nie udało się połączyć kafelków strzałką')
}
await page.waitForSelector('.react-flow__edge')
console.log('✓ strzałka logicznej kolejności połączona')

// tkanka łączna (notatka) — edycja w oknie po podwójnym kliku
await page.click('button[title*="tkankę łączną"]')
await page.waitForSelector('.path-node-text')
await page.dblclick('.path-node-text .path-node-notebody')
// okno notatki otwiera się w trybie wizualnym (pisanie), nie w kodzie
await page.waitForSelector('.note-modal .rich-content .tiptap')
await page.click('.note-modal .rich-content .tiptap')
await page.keyboard.type('Intuicja: odległość uogólnia |x-y|.')
await page.waitForTimeout(600)
await page.click('.note-modal .btn-close')
await page.waitForSelector('.path-node-text:has-text("Intuicja")')
console.log('✓ tkanka łączna dodana i wypełniona (okno edycji)')

// grupowanie: zaznacz oba kafelki kafelków (Ctrl+klik) i scal w grupę
await page.click('.react-flow__node:has-text("Metryka")')
await page.keyboard.down('Control')
await page.click('.react-flow__node:has-text("Przestrzeń")')
await page.keyboard.up('Control')
await page.click('button[title*="Scal zaznaczone"]')
await zloz(page, 'Przestrzeń metryczna (pełna)')
await page.waitForSelector('.path-node-group')
console.log('✓ grupa utworzona')

// rozgrupuj z powrotem
await page.hover('.path-node-group')
await page.waitForTimeout(400)
await page.click('.path-node-open[title*="Rozgrupuj"]', { force: true })
await page.waitForSelector('.react-flow__node-block:has-text("Metryka")')
console.log('✓ rozgrupowanie działa')

await page.screenshot({ path: 'scripts/shot-11-sciezka.png' })

// skrypt (trzeci tryb widoku — panel PDF i pasek boczny zostają)
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-embed')
await page.waitForSelector('.script-block')
const sidebarVisible = await page.locator('.sidebar').isVisible()
const blockCount = await page.locator('.script-block').count()
const hasText = await page.locator('.script-text:has-text("Intuicja")').count()
console.log(
  `✓ skrypt: ${blockCount} bloki, tkanka łączna: ${hasText === 1 ? 'jest' : 'BRAK'}, pasek boczny widoczny: ${sidebarVisible}`,
)
await page.screenshot({ path: 'scripts/shot-12-skrypt.png' })

// trwałość: przeładuj i wróć do ścieżki
await page.click('.view-switch button:has-text("Mapa")')
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.click('.path-item:has-text("Analiza")')
await page.waitForSelector('.path-node:has-text("Metryka")')
const nodeCount = await page.locator('.path-node').count()
console.log(`✓ ścieżka przetrwała przeładowanie (${nodeCount} kafelki)`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
