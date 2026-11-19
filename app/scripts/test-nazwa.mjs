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
  executablePath: process.env.KOMP_PRZEGLADARKA ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
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
const zakladki = await page.locator('.icon-picker-zakladka').count()
check('znaczki są pogrupowane w zakładki', zakladki >= 5, `zakładek: ${zakladki}`)
// jedna grupa naraz — okienko nie ma zajmować pół ekranu
const widoczne = await page.locator('.icon-picker-btn').count()
check('widać jedną grupę naraz', widoczne > 0 && widoczne <= 16, `znaczków: ${widoczne}`)
await page.click('.icon-picker-zakladka:has-text("Matematyka")')
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
await page.click('.plakietka-domyslna')
await page.click('.name-dialog button:has-text("Zapisz")')
await page.waitForTimeout(400)
check('cofnięcie do domyślnego znaczka',
  (await page.locator('.folder-row:has-text("Algebra") .folder-icon').count()) === 0)

// 7. kafelek: znaczek zastępuje plakietkę typu
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Granica')
await page.waitForTimeout(400)
await page.click('.btn-close[title*="Zamknij kafelek"]')
check('bez znaczka kafelek pokazuje plakietkę typu',
  (await page.locator('.concept-item:has-text("Granica") .type-mini').count()) === 1)
await page.click('.concept-item:has-text("Granica")', { button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Zmień nazwę")')
await page.waitForSelector('.name-dialog')
await page.click('.name-dialog-icon')
await page.click('.icon-picker-zakladka:has-text("Matematyka")')
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
await page.click('.icon-picker-zakladka:has-text("Matematyka")')
await page.click('.icon-picker-btn[title="sigma"]')
await page.click('.name-dialog button:has-text("Zapisz")')
await page.waitForTimeout(400)
check('nazwa i znaczek zapisują się razem',
  (await page.locator('.concept-item:has-text("Granica ciągu") .tree-icon svg').count()) === 1)

// 9. barwa znaczka
await page.click('.concept-item:has-text("Granica ciągu")', { button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Zmień nazwę")')
await page.waitForSelector('.name-dialog')
await page.click('.name-dialog-icon')
await page.waitForSelector('.icon-picker-colors')
// domyślna + osiem gotowych + własna
check('paleta ma barwy, domyślną i własną',
  (await page.locator('.icon-picker-color').count()) === 10,
  `${await page.locator('.icon-picker-color').count()}`)
check('własna barwa otwiera suwaki',
  (await page.locator('.icon-picker-color.wlasna').count()) === 1)
await page.click('.icon-picker-color.wlasna')
await page.waitForTimeout(400)
check('suwaki własnej barwy: odcień, nasycenie, jasność',
  (await page.locator('.barwa-suwaki input').count()) === 3,
  `${await page.locator('.barwa-suwaki input').count()}`)
check('własną barwę da się też wpisać',
  (await page.locator('.barwa-kod').count()) === 1)
await page.click('.icon-picker-color[title="Ceglany"]')
await page.click('.icon-picker-zakladka:has-text("Matematyka")')
await page.click('.icon-picker-btn[title="sigma"]')
await page.click('.name-dialog button:has-text("Zapisz")')
await page.waitForTimeout(400)
const kolorZnaczka = await page.evaluate(
  () => getComputedStyle(document.querySelector('.concept-item .tree-icon')).color,
)
check('znaczek przyjmuje wybraną barwę', kolorZnaczka === 'rgb(168, 69, 47)', kolorZnaczka)

// 10. prowadnica rozwiniętego folderu biegnie pod środkiem znaczka folderu
await page.click('.folder-row:has-text("Algebra")', { button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Zmień nazwę")')
await page.waitForSelector('.name-dialog')
await page.click('.name-dialog-icon')
await page.click('.icon-picker-zakladka:has-text("Porządek")')
await page.click('.icon-picker-btn[title="boxes"]')
await page.click('.name-dialog button:has-text("Zapisz")')
await page.waitForTimeout(400)
// coś w środku, żeby prowadnica miała co obejmować
await page.click('.folder-row:has-text("Algebra")')
await page.waitForSelector('.folder-children')
const wnetrze = await page.locator('.folder-children').boundingBox()
await page.mouse.click(wnetrze.x + wnetrze.width / 2, wnetrze.y + wnetrze.height / 2, {
  button: 'right',
})
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Nowy kafelek")')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'W środku')
await page.waitForTimeout(400)
await page.click('.btn-close[title*="Zamknij kafelek"]')
await page.waitForSelector('.folder-children')
const geometria = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.folder-row')].find((r) =>
    r.textContent.includes('Algebra'),
  )
  const znaczek = row.querySelector('.folder-icon').getBoundingClientRect()
  const linia = row.parentElement.querySelector('.folder-children').getBoundingClientRect()
  return {
    srodekZnaczka: znaczek.left + znaczek.width / 2,
    linia: linia.left,
    strzalka: !!row.querySelector('.folder-chevron:not(.folder-icon)'),
  }
})
check('prowadnica pod środkiem znaczka folderu',
  Math.abs(geometria.srodekZnaczka - geometria.linia) <= 1.5,
  `znaczek ${geometria.srodekZnaczka.toFixed(1)} vs linia ${geometria.linia.toFixed(1)}`)
check('znaczek stoi zamiast strzałki, nie obok', !geometria.strzalka)

// 11. kopia kafelka niesie jego znaczek
await page.click('.concept-item:has-text("Granica ciągu")', { button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Powiel")')
await page.waitForTimeout(700)
check('kopia zachowuje znaczek',
  (await page.locator('.concept-item:has-text("(kopia)") .tree-icon svg').count()) === 1)

// 12. własna plakietka: trzy litery na barwnym tle, zamiast znaczka
await page.click('.concept-item:has-text("Granica ciągu")', { button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Zmień nazwę")')
await page.waitForSelector('.name-dialog')
await page.click('.name-dialog-icon')
await page.waitForSelector('.plakietka-litery')
await page.fill('.plakietka-litery', 'ZFC')
await page.waitForTimeout(300)
check('podgląd pokazuje wpisane litery',
  (await page.textContent('.name-dialog-icon')).trim() === 'ZFC',
  await page.textContent('.name-dialog-icon'))
await page.click('.icon-picker-color[title="Ceglany"]')
await page.click('.name-dialog button:has-text("Zapisz")')
await page.waitForTimeout(600)
const wlasna = page.locator('.concept-item:has-text("Granica ciągu"):not(:has-text("kopia")) .type-mini').first()
check('własna plakietka trafia do drzewa',
  (await wlasna.textContent()).trim() === 'ZFC', await wlasna.textContent())
check('własna plakietka zastępuje znaczek',
  (await page.locator('.concept-item:has-text("Granica ciągu"):not(:has-text("kopia")) .tree-icon').count()) === 0)
const tlo = await wlasna.evaluate((el) => getComputedStyle(el).getPropertyValue('--block-color'))
check('własna plakietka bierze wybraną barwę', tlo.trim() === '#a8452f', tlo)

// przeżywa przeładowanie
await page.reload()
await page.waitForSelector('.concept-item:has-text("Granica ciągu")')
check('własna plakietka zapamiętana w bazie',
  (await page.locator('.concept-item:has-text("Granica ciągu"):not(:has-text("kopia")) .type-mini').first().textContent()).trim() ===
    'ZFC')

// i da się z niej wrócić
await page.click('.concept-item:has-text("Granica ciągu")', { button: 'right' })
await page.waitForSelector('.tree-menu')
await page.click('.tree-menu-item:has-text("Zmień nazwę")')
await page.waitForSelector('.name-dialog')
await page.click('.name-dialog-icon')
await page.click('.plakietka-domyslna')
await page.click('.name-dialog button:has-text("Zapisz")')
await page.waitForTimeout(600)
check('powrót do plakietki rodzaju',
  (await page.locator('.concept-item:has-text("Granica ciągu"):not(:has-text("kopia")) .type-mini').first().textContent()).trim() ===
    'DEF')

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(
  problems.length === 0
    ? '>>> WSZYSTKO POPRAWNE'
    : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`,
)
await browser.close()
