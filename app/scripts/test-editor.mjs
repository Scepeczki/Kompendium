// Test Etapu 4: tryb wizualny (TipTap), przełączanie z kodem, wzory KaTeX
// w miejscu, skróty Ctrl+B/M w kodzie, motyw jasny/ciemny.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

await page.click('text=+ Nowy klocek')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Hybryda')

// 1. domyślnie tryb wizualny
await page.waitForSelector('.rich-content .tiptap')
console.log('✓ tryb wizualny domyślny (TipTap)')

// 2. pisanie + pogrubienie przyciskiem + wzór z paska
await page.click('.rich-content .tiptap')
await page.keyboard.type('Zwykły ')
await page.click('.rich-btn:has-text("B")')
await page.keyboard.type('gruby')
await page.click('.rich-btn:has-text("B")')
await page.keyboard.type(' i wzór ')
await page.click('button[title*="Wzór w tekście"]')
await page.keyboard.type(' i dalej tekst') // odsuń kursor — wzór ma się wyrenderować
await page.waitForTimeout(800)
const mathRendered = await page.locator('.rich-content .katex').count()
console.log(`✓ wzór KaTeX renderuje się w miejscu w trybie wizualnym: ${mathRendered > 0}`)

// 3. przełącz na Kod → markdown zawiera **gruby** i $
await page.click('.view-switch button:has-text("Kod")')
await page.waitForSelector('.editor-code .cm-content')
const code = await page.textContent('.editor-code .cm-content')
console.log(
  `✓ kod po przełączeniu: pogrubienie ${code.includes('**gruby**') ? 'ok' : 'BRAK!'}, wzór ${
    code.includes('$') ? 'ok' : 'BRAK!'
  }`,
)

// 4. skróty w kodzie: zaznacz słowo i Ctrl+B, potem Ctrl+M na innym
await page.click('.editor-code .cm-content')
await page.keyboard.press('Control+End')
await page.keyboard.type('\n\nkursywa tu')
await page.keyboard.press('Home')
await page.keyboard.press('Shift+Control+ArrowRight')
await page.keyboard.press('Control+i')
await page.waitForTimeout(400)
const code2 = await page.textContent('.editor-code .cm-content')
console.log(`✓ Ctrl+I w kodzie: ${code2.includes('*kursywa') ? 'ok' : 'BRAK: ' + code2.slice(-60)}`)

// 5. wróć do wizualnego → pogrubienie widoczne jako <strong>
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForSelector('.rich-content .tiptap strong')
console.log('✓ powrót do wizualnego: formatowanie zachowane')

// 6. motyw ciemny: przełącz i sprawdź tło
const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
await page.click('button[title*="motyw"]')
await page.waitForTimeout(300)
const theme = await page.evaluate(() => document.documentElement.dataset.theme)
const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
console.log(
  `✓ motyw: ${theme}, tło zmienione: ${bgLight !== bgDark} (${bgLight} → ${bgDark})`,
)
await page.screenshot({ path: 'scripts/shot-16-dark.png' })

// 7. motyw zapamiętany po przeładowaniu
await page.reload()
await page.waitForSelector('text=Kompendium')
const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme)
console.log(`✓ motyw po przeładowaniu: ${themeAfter}`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
