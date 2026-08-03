// Test dymny: uruchamia aplikację w headless Edge, klika przez podstawowy
// przepływ (nowy klocek → wpisanie treści z LaTeX-em) i robi zrzuty ekranu.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(String(err)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium', { timeout: 20000 })
await page.screenshot({ path: 'scripts/shot-1-start.png' })

// Nowy klocek
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name', { timeout: 10000 })

// Nazwa
await page.fill('.editor-name', 'Przestrzeń metryczna')

// Treść z LaTeX-em w CodeMirror
await page.click('.view-switch button:has-text("Podział")')
await page.click('.cm-content')
await page.keyboard.type(
  'Niech $X$ będzie zbiorem. Funkcję $d: X \\times X \\to [0, \\infty)$ nazywamy metryką, gdy:\n\n1. $d(x,y) = 0 \\iff x = y$\n2. $d(x,y) = d(y,x)$\n3. $$d(x,z) \\le d(x,y) + d(y,z)$$',
)

// Poczekaj na autozapis i rendering podglądu
await page.waitForSelector('.katex', { timeout: 10000 })
await page.waitForTimeout(800)
await page.screenshot({ path: 'scripts/shot-2-edytor.png' })

// Nowa wersja (obsłuż window.prompt)
page.on('dialog', (d) => d.accept('wg Rudina'))
await page.click('text=+ nowa wersja')
await page.waitForSelector('.version-pill.active:has-text("wg Rudina")', { timeout: 10000 })
await page.screenshot({ path: 'scripts/shot-3-wersje.png' })

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
