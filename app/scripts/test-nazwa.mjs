// Test okienka nazwy i wyboru znaczka: zapisywanie, Escape, Enter,
// znaczek w drzewie, cofnięcie do domyślnego.
import { chromium } from 'playwright'
import { nazwij, nowyFolder } from './lib.mjs'

const problems = []
const errors = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problems.push(nazwa)
}

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// 1. tworzenie folderu idzie przez własne okienko, nie systemowy prompt
await page.click('.sidebar-create-btn[title="Nowy folder"]')
await page.waitForSelector('.name-dialog')
check('okienko nazwy ma pole i znaczek',
  (await page.locator('.name-dialog-input').count()) === 1 &&
    (await page.locator('.name-dialog-icon').count()) === 1)
check('przycisk zapisu nieaktywny przy pustej nazwie',
  await page.locator('.name-dialog button:has-text("Zapisz")').isDisabled())

// 2. Escape zamyka bez tworzenia
await page.keyboard.press('Escape')
await page.waitForTimeout(250)
check('Escape zamyka okienko', (await page.locator('.name-dialog').count()) === 0)
check('nic nie powstało', (await page.locator('.folder-row').count()) === 0)

// 3. Enter zapisuje
await page.click('.sidebar-create-btn[title="Nowy folder"]')
await page.waitForSelector('.name-dialog-input')
await page.fill('.name-dialog-input', 'Analiza')
await page.keyboard.press('Enter')
await page.waitForSelector('.folder-row:has-text("Analiza")')
check('Enter zapisuje nazwę', true)

// 4. wybór znaczka: siatka pogrupowana, wybór wstawia znaczek do drzewa
await nowyFolder(page, 'Algebra')
await page.click('.folder-row:has-text("Algebra")', { button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Zmień nazwę")')
await page.waitForSelector('.name-dialog')
await page.click('.name-dialog-icon')
await page.waitForSelector('.icon-picker')
const grupy = await page.locator('.icon-picker-group').count()
const znaczki = await page.locator('.icon-picker-btn').count()
check('znaczki są pogrupowane', grupy >= 5, `grup: ${grupy}`)
check('jest z czego wybierać', znaczki >= 40, `znaczków: ${znaczki}`)
await page.click('.icon-picker-btn[title="sigma"]')
await page.waitForTimeout(200)
check('siatka chowa się po wyborze',
  (await page.locator('.icon-picker').count()) === 0)
check('wybrany znaczek widać w okienku',
  (await page.locator('.name-dialog-icon.wybrany').count()) === 1)
await page.click('.name-dialog button:has-text("Zapisz")')
await page.waitForTimeout(400)
check('znaczek trafił do wiersza folderu',
  (await page.locator('.folder-row:has-text("Algebra") .folder-icon svg').count()) === 1)

// 5. znaczek przeżywa przeładowanie (siedzi w bazie, nie w pamięci ekranu)
await page.reload()
await page.waitForSelector('.folder-row:has-text("Algebra")')
check('znaczek zapamiętany w bazie',
  (await page.locator('.folder-row:has-text("Algebra") .folder-icon svg').count()) === 1)

// 6. „Bez własnego znaczka" wraca do domyślnego
await page.click('.folder-row:has-text("Algebra")', { button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Zmień nazwę")')
await page.waitForSelector('.name-dialog')
await page.click('.name-dialog-icon')
await page.click('.icon-picker-clear')
await page.click('.name-dialog button:has-text("Zapisz")')
await page.waitForTimeout(400)
check('cofnięcie do domyślnego znaczka',
  (await page.locator('.folder-row:has-text("Algebra") .folder-icon').count()) === 0)

// 7. klocek: znaczek zastępuje plakietkę typu
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Granica')
await page.waitForTimeout(400)
await page.click('.btn-close[title*="Zamknij klocek"]')
check('bez znaczka klocek pokazuje plakietkę typu',
  (await page.locator('.concept-item:has-text("Granica") .type-mini').count()) === 1)
await page.click('.concept-item:has-text("Granica")', { button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Zmień nazwę")')
await page.waitForSelector('.name-dialog')
await page.click('.name-dialog-icon')
await page.click('.icon-picker-btn[title="infinity"]')
await page.click('.name-dialog button:has-text("Zapisz")')
await page.waitForTimeout(400)
check('znaczek zastępuje plakietkę typu',
  (await page.locator('.concept-item:has-text("Granica") .tree-icon svg').count()) === 1 &&
    (await page.locator('.concept-item:has-text("Granica") .type-mini').count()) === 0)

// 8. zmiana nazwy i znaczka naraz
await page.click('.concept-item:has-text("Granica")', { button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Zmień nazwę")')
await page.waitForSelector('.name-dialog-input')
await page.fill('.name-dialog-input', 'Granica ciągu')
await page.click('.name-dialog-icon')
await page.click('.icon-picker-btn[title="sigma"]')
await page.click('.name-dialog button:has-text("Zapisz")')
await page.waitForTimeout(400)
check('nazwa i znaczek zapisują się razem',
  (await page.locator('.concept-item:has-text("Granica ciągu") .tree-icon svg').count()) === 1)

// 9. kopia klocka niesie jego znaczek
await page.click('.concept-item:has-text("Granica ciągu")', { button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Powiel")')
await page.waitForTimeout(700)
check('kopia zachowuje znaczek',
  (await page.locator('.concept-item:has-text("(kopia)") .tree-icon svg').count()) === 1)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
