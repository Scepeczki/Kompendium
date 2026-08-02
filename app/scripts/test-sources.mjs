// Test źródeł pod treścią bloku (lista + podgląd fragmentu po najechaniu)
// oraz pokazywania wszystkich wykorzystanych fragmentów w widoku PDF.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
page.on('dialog', (d) => d.accept('Ścieżka ze źródłami'))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// klocek + PDF + dwa podpięte źródła
await page.click('text=+ Nowy klocek')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Definicja ze źródłem')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.type('Treść oparta na źródłach.')
await page.waitForTimeout(500)

await page.setInputFiles('input[type=file][accept="application/pdf"]', 'scripts/test-multi.pdf')
await page.waitForSelector('.pdf-page-wrap canvas')
await page.waitForTimeout(1200)

const attach = async (dy) => {
  await page.click('text=📌 Podepnij źródło')
  await page.waitForSelector('.pdf-banner')
  const c = await page.locator('.pdf-page-wrap canvas').first().boundingBox()
  await page.mouse.move(c.x + 40, c.y + dy)
  await page.mouse.down()
  await page.mouse.move(c.x + 300, c.y + dy + 60, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(600)
}
await attach(40)
await attach(160)
const chips = await page.locator('.source-chip').count()
console.log(`✓ dwa źródła podpięte w edytorze: ${chips}`)

// 1. wszystkie wykorzystane fragmenty widoczne w PDF
await page.waitForTimeout(500)
const used = await page.locator('.pdf-used').count()
console.log(`✓ użyte fragmenty zaznaczone w PDF: ${used} (oczekiwane 2)`)
const usedLabel = await page.locator('.pdf-used .pdf-used-label').first().textContent()
console.log(`✓ etykieta fragmentu: „${usedLabel}"`)

// 2. licznik i przełącznik w pasku narzędzi
const toggle = page.locator('.pdf-nav button:has-text("▣")')
console.log(`✓ licznik w pasku: „${(await toggle.textContent()).trim()}"`)
await toggle.click()
await page.waitForTimeout(300)
const afterHide = await page.locator('.pdf-used').count()
console.log(`✓ przełącznik chowa fragmenty: ${afterHide} (oczekiwane 0)`)
await toggle.click()
await page.waitForTimeout(300)

// 3. klik w prostokąt otwiera klocek
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.waitForTimeout(300)
await page.click('.pdf-used')
await page.waitForSelector('.editor-name')
console.log(
  `✓ klik w użyty fragment otwiera klocek: „${await page.inputValue('.editor-name')}"`,
)

// 4. lista źródeł w Skrypcie ścieżki
await page.click('button[title*="Nowa ścieżka"]')
await page.waitForSelector('.path-canvas')
await page.dragAndDrop('.concept-item:has-text("Definicja ze źródłem")', '.path-flow', {
  targetPosition: { x: 400, y: 200 },
})
await page.waitForSelector('.path-node')
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-block')
await page.waitForTimeout(400)
const toggleText = await page.locator('.source-list-toggle').textContent()
console.log(`✓ źródła pod treścią bloku: „${toggleText.trim()}"`)

// 5. rozwinięcie listy i podgląd po najechaniu
await page.click('.source-list-toggle')
await page.waitForSelector('.source-list-item')
const items = await page.locator('.source-list-item').count()
console.log(`✓ lista rozwinięta: ${items} źródła`)
await page.hover('.source-list-item')
await page.waitForSelector('.source-preview', { timeout: 15000 })
await page.waitForTimeout(1500)
const preview = await page.evaluate(() => {
  const img = document.querySelector('.source-preview img')
  return img ? { w: img.naturalWidth, h: img.naturalHeight } : null
})
console.log(
  `✓ podgląd fragmentu po najechaniu: ${
    preview ? `obrazek ${preview.w}×${preview.h}px` : 'BRAK OBRAZKA!'
  }`,
)

// 6. klik w źródło przewija PDF do właściwego miejsca
await page.click('.source-list-item .source-jump')
await page.waitForSelector('.pdf-highlight', { timeout: 10000 })
const jumped = await page.evaluate(
  () => document.querySelector('.pdf-highlight')?.closest('.pdf-page-wrap')?.dataset.page,
)
console.log(`✓ klik w źródło pokazuje miejsce w PDF: strona ${jumped}`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
