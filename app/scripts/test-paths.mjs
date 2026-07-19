// Test Etapu 3: ścieżka na canvasie — kafelki, strzałki, tekst, fuzja, skrypt.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const answers = ['Analiza — wykład 1', 'Przestrzeń metryczna (pełna)']
page.on('dialog', (d) => d.accept(answers.shift() ?? ''))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// dwa klocki z treścią
for (const [name, content] of [
  ['Metryka', 'Funkcja $d: X \\times X \\to [0,\\infty)$.'],
  ['Przestrzeń', 'Zbiór $X$ z metryką.'],
]) {
  await page.click('text=+ Nowy klocek')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.click('.cm-content')
  await page.keyboard.type(content)
  await page.waitForTimeout(600)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}

// nowa ścieżka
await page.click('button[title*="Nowa ścieżka"]')
await page.waitForSelector('.path-canvas')
console.log('✓ ścieżka utworzona, canvas otwarty')

// przeciągnij oba klocki na canvas
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
await page.waitForSelector('.react-flow__edge')
console.log('✓ strzałka logicznej kolejności połączona')

// tkanka łączna
await page.click('button[title*="tkankę łączną"]')
await page.waitForSelector('.path-node-text textarea')
await page.fill('.path-node-text textarea', 'Intuicja: odległość uogólnia |x-y|.')
await page.waitForTimeout(700)
console.log('✓ tkanka łączna dodana i wypełniona')

// fuzja: zaznacz oba kafelki klocków (klik + shift-klik) i scal
await page.click('.path-node:has-text("Metryka")')
await page.keyboard.down('Control')
await page.click('.path-node:has-text("Przestrzeń")')
await page.keyboard.up('Control')
await page.click('button[title*="Scal zaznaczone"]')
await page.waitForSelector('.path-node-fusion')
console.log('✓ fuzja utworzona')

// rozdziel z powrotem
await page.click('.path-node-open[title*="Rozdziel"]')
await page.waitForSelector('.path-node:has-text("Metryka")')
console.log('✓ rozdzielenie fuzji działa')

await page.screenshot({ path: 'scripts/shot-11-sciezka.png' })

// skrypt
await page.click('text=📜 Skrypt')
await page.waitForSelector('.script-overlay')
await page.waitForSelector('.script-block')
const blockCount = await page.locator('.script-block').count()
const hasText = await page.locator('.script-text:has-text("Intuicja")').count()
console.log(`✓ skrypt: ${blockCount} bloki, tkanka łączna: ${hasText === 1 ? 'jest' : 'BRAK'}`)
await page.screenshot({ path: 'scripts/shot-12-skrypt.png' })

// trwałość: przeładuj i wróć do ścieżki
await page.click('.script-overlay .btn-close')
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.click('.path-item:has-text("Analiza")')
await page.waitForSelector('.path-node:has-text("Metryka")')
const nodeCount = await page.locator('.path-node').count()
console.log(`✓ ścieżka przetrwała przeładowanie (${nodeCount} kafelki)`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
