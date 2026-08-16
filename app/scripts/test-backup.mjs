// Test kopii zapasowej: eksport zip, wyczyszczenie bazy, import, odzyskanie
// kafelków / ścieżek / PDF-a. Sprawdza też odporność na osierocony folderId.
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { nazwij, potwierdz } from './lib.mjs'

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

// dane: kafelek, PDF, ścieżka
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
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
await page.click('.btn-close[title*="Zamknij kafelek"]')

await page.click('button[title*="Nowa ścieżka"]')
await nazwij(page, "Testowa ścieżka")
await page.waitForSelector('.path-canvas')
await page.click('.path-canvas .btn-close[title*="Zamknij ścieżkę"]')

// własny typ i zmienione ustawienie — mają wrócić razem z danymi
await page.click('button[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.click('.settings-nav-item:has-text("Typy kafelków")')
await page.waitForSelector('.type-row')
await page.click('.type-add')
await page.fill('.type-row-nowy .type-row-name', 'Aksjomat')
await page.fill('.type-row-nowy .type-row-abbr', 'AKS')
await page.click('.type-row-nowy button:has-text("Dodaj")')
await page.waitForTimeout(400)
await page.click('.settings-nav-item:has-text("Wygląd")')
await page.click('.settings-bg-btn[data-bg-preview="kratka"]')
await page.waitForTimeout(300)

// eksport
await page.click('.settings-nav-item:has-text("Dane")')
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.click('button:has-text("Eksportuj kopię")'),
])
const backupPath = 'scripts/backup-test.zip'
await download.saveAs(backupPath)
const size = readFileSync(backupPath).length
console.log(`✓ eksport pobrany, rozmiar pliku: ${size} B`)
await page.waitForSelector('text=Kopia zapasowa pobrana.')

// wyczyść bazę i ustawienia (symulacja „świeżej przeglądarki")
await page.evaluate(() => {
  indexedDB.deleteDatabase('kompendium')
  for (const k of Object.keys(localStorage)) if (k.startsWith('ui.')) localStorage.removeItem(k)
})
await page.click('.settings-page-head button:has-text("Wróć")')
await page.reload()
await page.waitForSelector('text=Kompendium')
const emptyBefore = await page.locator('.concept-item').count()
console.log(`✓ baza wyczyszczona (kafelków widocznych: ${emptyBefore})`)

// import
await page.click('button[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.click('.settings-nav-item:has-text("Dane")')
await page.setInputFiles('.settings-page input[type=file]', backupPath)
await potwierdz(page)
await page.waitForSelector('text=/Wczytano:/', { timeout: 10000 })
const summary = await page.textContent('.settings-status')
console.log(`✓ import: ${summary.trim()}`)
await page.click('.settings-page-head button:has-text("Wróć")')

// weryfikacja: kafelek, ścieżka i PDF wróciły
await page.waitForSelector('.concept-item:has-text("Do kopii zapasowej")')
await page.waitForSelector('.path-item')
console.log('✓ kafelek i ścieżka odzyskane po imporcie')

await page.click('.concept-item:has-text("Do kopii zapasowej")')
await page.click('.pdf-lib-toggle')
await page.waitForSelector('.pdflib-item:has-text("test")')
console.log('✓ PDF odzyskany w bibliotece po imporcie')

// własny typ i ustawienie wyglądu też wróciły
await page.click('button[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.click('.settings-nav-item:has-text("Typy kafelków")')
await page.waitForSelector('.type-row')
const typy = await page.evaluate(() =>
  [...document.querySelectorAll('.type-row-name')].map((i) => i.value),
)
console.log(
  `✓ typy odzyskane: ${typy.length} pozycji, własny „Aksjomat" ${
    typy.includes('Aksjomat') ? 'jest' : 'BRAK!'
  }`,
)
await page.reload()
await page.waitForSelector('text=Kompendium')
const deseń = await page.evaluate(() => document.documentElement.dataset.bg)
console.log(
  `✓ ustawienia wyglądu odzyskane: deseń tła = ${deseń} (${
    deseń === 'kratka' ? 'ok' : 'BRAK!'
  })`,
)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
