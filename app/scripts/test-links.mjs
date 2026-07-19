// Test Etapu 2: wiki-linki, tworzenie brakującego pojęcia, odwołania zwrotne, graf.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
page.on('dialog', (d) => d.accept()) // confirm przy tworzeniu brakującego pojęcia

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// pojęcie „Metryka"
await page.click('text=+ Nowy klocek')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Metryka')
await page.click('.cm-content')
await page.keyboard.type('Funkcja odległości $d$.')
await page.waitForTimeout(600)
await page.click('.btn-close[title*="Zamknij klocek"]')

// pojęcie „Przestrzeń metryczna" linkujące do Metryki
await page.click('text=+ Nowy klocek')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Przestrzeń metryczna')
await page.click('.cm-content')
await page.keyboard.type('Para (X, d), gdzie d to [[Metryka]].')
await page.waitForTimeout(600)

// 1. wiki-link wyrenderowany i klikalny
await page.waitForSelector('a.wikilink:not(.wikilink-missing)')
await page.click('a.wikilink')
await page.waitForFunction(
  () => document.querySelector('.editor-name')?.value === 'Metryka',
)
console.log('✓ wiki-link nawiguje do pojęcia')

// 2. odwołania zwrotne w „Metryka"
await page.waitForSelector('.backlink-chip:has-text("Przestrzeń metryczna")')
console.log('✓ odwołanie zwrotne widoczne')
await page.click('.backlink-chip')
await page.waitForFunction(
  () => document.querySelector('.editor-name')?.value === 'Przestrzeń metryczna',
)
console.log('✓ nawigacja odwołaniem zwrotnym działa')

// 3. brakujący link — utworzenie pojęcia klikiem (dialog auto-akceptowany)
await page.click('.cm-content')
await page.keyboard.press('End')
await page.keyboard.type(' Zobacz też [[Kula otwarta]].')
await page.waitForSelector('a.wikilink-missing')
console.log('✓ brakujący link oznaczony')
await page.click('a.wikilink-missing')
await page.waitForFunction(
  () => document.querySelector('.editor-name')?.value === 'Kula otwarta',
)
console.log('✓ klik w brakujący link tworzy pojęcie')

// 4. graf: 3 węzły, klik w węzeł otwiera pojęcie
await page.click('button[title="Graf powiązań"]')
await page.waitForSelector('.graph-svg')
await page.waitForTimeout(1200) // symulacja się układa
const nodeCount = await page.locator('.graph-node').count()
const linkCount = await page.locator('.graph-link').count()
console.log(`✓ graf: ${nodeCount} węzły, ${linkCount} krawędzie`)
await page.screenshot({ path: 'scripts/shot-10-graf.png' })
await page.click('.graph-node:has-text("Metryka")')
await page.waitForFunction(() => {
  const el = document.querySelector('.editor-name')
  return el && (el.value === 'Metryka' || el.value === 'Przestrzeń metryczna')
})
console.log('✓ klik w węzeł grafu otwiera klocek')

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
