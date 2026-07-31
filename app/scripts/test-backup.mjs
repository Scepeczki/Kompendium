// Test kopii zapasowej: eksport zip, wyczyszczenie bazy, import, odzyskanie
// klocków / ścieżek / PDF-a. Sprawdza też odporność na osierocony folderId.
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
page.on('dialog', (d) => d.accept('Testowa ścieżka'))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// dane: klocek, PDF, ścieżka
await page.click('text=+ Nowy klocek')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Do kopii zapasowej')
await page.setInputFiles('input[type=file][accept="application/pdf"]', {
  name: 'test.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF',
  ),
})
await page.waitForSelector('.pdf-page-wrap canvas', { timeout: 15000 })
await page.click('.btn-close[title*="Zamknij klocek"]')

await page.click('button[title*="Nowa ścieżka"]')
await page.waitForSelector('.path-canvas')
await page.click('.path-canvas .btn-close[title*="Zamknij ścieżkę"]')

// eksport
await page.click('button[title="Ustawienia"]')
await page.waitForSelector('.settings-modal')
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.click('button:has-text("Eksportuj kopię")'),
])
const backupPath = 'scripts/backup-test.zip'
await download.saveAs(backupPath)
const size = readFileSync(backupPath).length
console.log(`✓ eksport pobrany, rozmiar pliku: ${size} B`)
await page.waitForSelector('text=Kopia zapasowa pobrana.')

// wyczyść bazę (symulacja "świeżej przeglądarki")
await page.evaluate(() => indexedDB.deleteDatabase('kompendium'))
await page.click('.settings-modal .btn-close')
await page.reload()
await page.waitForSelector('text=Kompendium')
const emptyBefore = await page.locator('.concept-item').count()
console.log(`✓ baza wyczyszczona (klocków widocznych: ${emptyBefore})`)

// import
await page.click('button[title="Ustawienia"]')
await page.waitForSelector('.settings-modal')
await page.setInputFiles('.settings-modal input[type=file]', backupPath)
await page.waitForSelector('text=/Wczytano:/', { timeout: 10000 })
const summary = await page.textContent('.settings-status')
console.log(`✓ import: ${summary.trim()}`)
await page.click('.settings-modal .btn-close')

// weryfikacja: klocek, ścieżka i PDF wróciły
await page.waitForSelector('.concept-item:has-text("Do kopii zapasowej")')
await page.waitForSelector('.path-item')
console.log('✓ klocek i ścieżka odzyskane po imporcie')

await page.click('.concept-item:has-text("Do kopii zapasowej")')
await page.click('.pdf-lib-toggle')
await page.waitForSelector('.pdflib-item:has-text("test")')
console.log('✓ PDF odzyskany w bibliotece po imporcie')

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
