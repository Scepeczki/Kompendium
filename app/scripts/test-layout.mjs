// Test układu: zamykanie kafelka, chowanie/pokazywanie panelu PDF,
// przeciąganie krawędzi paneli.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: process.env.KOMP_PRZEGLADARKA ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// 1. Nowy kafelek → zamknij go przyciskiem ✕ → wraca ekran startowy
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.click('.btn-close[title*="Zamknij kafelek"]')
await page.waitForSelector('text=Zacznij budować kompendium')
console.log('✓ zamykanie kafelka działa')

// 2. Schowaj panel PDF → pojawia się wąski pasek 📖 PDF
await page.click('.pdf-toolbar .btn-close')
await page.waitForSelector('.pdf-reopen')
await page.screenshot({ path: 'scripts/shot-6-bez-pdf.png' })
console.log('✓ chowanie panelu PDF działa')

// 3. Przywróć panel PDF
await page.click('.pdf-reopen')
await page.waitForSelector('.pdf-toolbar')
console.log('✓ przywracanie panelu PDF działa')

// 4. Przeciągnij krawędź między edytorem a PDF o 200 px w prawo
const splitters = page.locator('.splitter')
const box = await splitters.nth(1).boundingBox()
await page.mouse.move(box.x + 2, box.y + 400)
await page.mouse.down()
await page.mouse.move(box.x + 200, box.y + 400, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(300)
await page.screenshot({ path: 'scripts/shot-7-resize.png' })
console.log('✓ przeciąganie krawędzi działa')

// 5. Układ zapamiętany po przeładowaniu
await page.reload()
await page.waitForSelector('text=Kompendium')
const pdfW = await page.evaluate(() => localStorage.getItem('ui.pdfW'))
console.log('✓ zapamiętana szerokość PDF:', pdfW)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
