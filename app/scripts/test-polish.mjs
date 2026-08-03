// Test drobnych ulepszeń: autofokus nazwy, akcje na liście, autouzupełnianie [[,
// Escape, szukajka ze ścieżkami, licznik.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
const answers = []
page.on('dialog', (d) => d.accept(answers.shift() ?? ''))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// 1. nowy klocek → nazwa od razu zaznaczona: samo pisanie ją nadpisuje
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.waitForFunction(
  () => document.activeElement?.classList.contains('editor-name'),
)
await page.keyboard.type('Granica ciągu')
const nameVal = await page.inputValue('.editor-name')
console.log(`✓ autofokus i nadpisanie nazwy: "${nameVal}" ${nameVal === 'Granica ciągu' ? '' : '— BŁĄD'}`)
await page.click('.btn-close[title*="Zamknij klocek"]')

// 2. akcje na liście: zmiana nazwy i usuwanie
answers.push('Granica')
await page.hover('.concept-item:has-text("Granica ciągu")')
await page.click('.concept-item .folder-action[title*="Zmień nazwę"]')
await page.waitForSelector('.concept-item:has-text("Granica"):not(:has-text("ciągu"))')
console.log('✓ zmiana nazwy z listy działa')

// 3. autouzupełnianie [[ w widoku Kod
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.keyboard.type('Ciąg zbieżny')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.type('Zobacz [[Gra')
await page.waitForSelector('.cm-tooltip-autocomplete')
const option = await page.textContent('.cm-tooltip-autocomplete li')
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
const code = await page.textContent('.editor-code .cm-content')
console.log(
  `✓ autouzupełnianie [[: podpowiedź "${option}", wynik zawiera [[Granica]]: ${code.includes(
    '[[Granica]]',
  )} (kod: ${JSON.stringify(code)})`,
)
await page.click('.btn-close[title*="Zamknij klocek"]')

// 4. szukajka znajduje ścieżki
answers.push('Ścieżka Granic')
await page.click('button[title*="Nowa ścieżka"]')
await page.waitForSelector('.path-canvas')
await page.click('.path-canvas .btn-close[title*="Zamknij ścieżkę"]')
// szukanie chowa się pod ikoną 🔍 — najpierw ją otwieramy
await page.click('.sidebar-tool[title*="Szukaj"]')
await page.waitForSelector('.sidebar-filters input[type=search]')
await page.fill('.sidebar-filters input[type=search]', 'granic')
await page.waitForSelector('.path-item:has-text("Ścieżka Granic")')
console.log('✓ szukajka znajduje ścieżki')
await page.fill('.sidebar-filters input[type=search]', '')

// 5. licznik
const footer = await page.textContent('.sidebar-footer')
console.log(`✓ licznik: "${footer.trim()}"`)

// 6. Escape zamyka ustawienia
await page.click('button[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.keyboard.press('Escape')
await page.waitForFunction(() => !document.querySelector('.settings-page'))
console.log('✓ Escape zamyka ustawienia')

// 7. usuwanie z listy
answers.push('')
await page.hover('.concept-item:has-text("Ciąg zbieżny")')
await page.click('.concept-item:has-text("Ciąg zbieżny") .folder-action[title*="Usuń"]')
await page.waitForFunction(
  () => ![...document.querySelectorAll('.concept-name')].some((e) => e.textContent === 'Ciąg zbieżny'),
)
console.log('✓ usuwanie pojęcia z listy działa')

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
