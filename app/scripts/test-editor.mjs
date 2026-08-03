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

await page.click('.sidebar-create-btn[title="Nowy klocek"]')
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

// 6. ustawienia: motyw ciemny + szerokość strony
const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
await page.click('button[title="Ustawienia"]')
await page.waitForSelector('.settings-modal')
await page.click('.settings-modal button:has-text("Ciemny")')
await page.fill('.settings-slider', '1200')
await page.click('.settings-modal .btn-close')
await page.waitForTimeout(300)
const pageWidth = await page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--page-width'),
)
console.log(`✓ szerokość strony ustawiona: ${pageWidth}`)
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
const widthAfter = await page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--page-width'),
)
console.log(`✓ po przeładowaniu: motyw=${themeAfter}, szerokość=${widthAfter}`)

// 8. LaTeX z ukośnikami przeżywa tryb wizualny: wpisz w Kodzie \left\{ ... \right\}
await page.click('.concept-item:has-text("Hybryda")')
await page.waitForSelector('.view-switch')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.press('Control+a')
await page.keyboard.type('Zbiór $$\\left\\{ 0,1,2,\\ldots \\right\\}$$ koniec.')
await page.waitForTimeout(700)
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForSelector('.rich-content .katex')
const katexErr = await page.locator('.rich-content .katex-error').count()
console.log(`✓ \\left\\{…\\right\\} renderuje się w wizualnym (błędy KaTeX: ${katexErr})`)
// wpisz coś w wizualnym (dopisz na końcu) i wróć do kodu — ukośniki nietknięte
await page.click('.rich-content .tiptap')
await page.keyboard.press('Control+End')
await page.keyboard.type(' dopisek')
await page.waitForTimeout(700)
await page.click('.view-switch button:has-text("Kod")')
const code3 = await page.textContent('.editor-code .cm-content')
console.log(
  `✓ po powrocie z wizualnego LaTeX nienaruszony: ${
    code3.includes('\\left\\{') && code3.includes('\\right\\}') ? 'ok' : 'ZEPSUTY: ' + code3
  }`,
)

// 8a. znaki <, >, & we wzorze pisanym w wizualnym nie zamieniają się w encje
await page.click('.view-switch button:has-text("Wizualny")')
await page.click('.rich-content .tiptap')
await page.keyboard.press('Control+End')
await page.keyboard.type(' Nierówność $n > 1$ i $a < b$.')
await page.waitForTimeout(700)
await page.click('.view-switch button:has-text("Kod")')
const code4 = await page.textContent('.editor-code .cm-content')
console.log(
  `✓ < i > we wzorach bez encji HTML: ${
    code4.includes('$n > 1$') && code4.includes('$a < b$') && !code4.includes('&gt;')
      ? 'ok'
      : 'ZEPSUTE: ' + code4.slice(-90)
  }`,
)

// 9. przełączanie między klockami w trybie wizualnym odświeża treść
await page.click('.view-switch button:has-text("Wizualny")')
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Drugi klocek')
await page.click('.rich-content .tiptap')
await page.keyboard.type('TREŚĆ-DRUGIEGO')
await page.waitForTimeout(700)
// przełącz na pierwszy klocek i z powrotem
await page.click('.concept-item:has-text("Hybryda")')
await page.waitForFunction(() =>
  document.querySelector('.rich-content .tiptap')?.textContent.includes('Zbiór'),
)
await page.click('.concept-item:has-text("Drugi klocek")')
await page.waitForFunction(() =>
  document.querySelector('.rich-content .tiptap')?.textContent.includes('TREŚĆ-DRUGIEGO'),
)
console.log('✓ przełączanie klocków odświeża tryb wizualny')

// 10. kolumna tekstu ograniczona (jak w Google Docs)
const widths = await page.evaluate(() => {
  const tt = document.querySelector('.rich-content .tiptap')
  const rc = document.querySelector('.rich-content')
  return { text: tt.getBoundingClientRect().width, panel: rc.getBoundingClientRect().width }
})
console.log(
  `✓ kolumna tekstu: ${Math.round(widths.text)}px w panelu ${Math.round(widths.panel)}px (ograniczona: ${
    widths.text <= 690
  })`,
)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
