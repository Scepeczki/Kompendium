// Test stylistyki bloków w Skrypcie (pasek nagłówka w kolorze typu, treść
// z akcentem) oraz ustawień kolorów i nasycenia tła.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
page.on('dialog', (d) => d.accept('Ścieżka'))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// klocek typu Twierdzenie + ścieżka z nim
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Blok testowy')
await page.selectOption('.type-select', 'twierdzenie')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.type('Treść twierdzenia $a^2$.')
await page.waitForTimeout(500)
await page.click('.btn-close[title*="Zamknij klocek"]')

await page.click('button[title*="Nowa ścieżka"]')
await page.waitForSelector('.path-canvas')
await page.dragAndDrop('.concept-item:has-text("Blok testowy")', '.path-flow', {
  targetPosition: { x: 300, y: 150 },
})
await page.waitForSelector('.path-node')
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-block')
await page.waitForTimeout(400)

// 1. struktura: pasek nagłówka + treść z akcentem
const struct = await page.evaluate(() => {
  const b = document.querySelector('.script-block')
  const head = b.querySelector('.script-block-head')
  const body = b.querySelector('.block-content')
  const type = b.querySelector('.script-block-type')
  return {
    hasHead: !!head,
    hasBody: !!body,
    typeText: type?.textContent ?? '',
    typeTransform: head ? getComputedStyle(type).textTransform : '',
    headBg: head ? getComputedStyle(head).backgroundColor : '',
    bodyBorder: body ? getComputedStyle(body).borderLeftWidth : '',
    bodyBorderColor: body ? getComputedStyle(body).borderLeftColor : '',
    // jednolita oprawa: etykieta wersji nad treścią i stopka ze źródłami
    versionLabel: b.querySelector('.block-pick')?.textContent?.trim() ?? '(brak)',
    versionUpper: b.querySelector('.block-pick')
      ? getComputedStyle(b.querySelector('.block-pick')).textTransform
      : '',
  }
})
console.log(
  `✓ struktura bloku: nagłówek ${struct.hasHead}, treść ${struct.hasBody}, typ „${struct.typeText}" (${struct.typeTransform})`,
)
console.log(
  `✓ akcent przy treści: ${struct.bodyBorder} ${struct.bodyBorderColor} (oczekiwana kreska > 0px)`,
)
console.log(
  `✓ etykieta wersji w oprawie bloku: „${struct.versionLabel}" (${struct.versionUpper})`,
)

// 2. pasek nagłówka zabarwiony kolorem typu (nie tłem panelu)
const panelBg = await page.evaluate(
  () => getComputedStyle(document.querySelector('.script-embed')).backgroundColor,
)
console.log(
  `✓ nagłówek w kolorze typu: ${struct.headBg} vs tło ${panelBg} (${
    struct.headBg !== panelBg ? 'ok' : 'BRAK KOLORU!'
  })`,
)

// 3. zmiana koloru typu w Ustawieniach przestraja blok
await page.click('button[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.click('.settings-nav-item:has-text("Bloki")')
await page.fill('.settings-color:has-text("Twierdzenie") input[type=color]', '#c81e4a')
await page.waitForTimeout(300)
// ustawienia są teraz pełną stroną, więc bloku nie widać w trakcie zmiany —
// najpierw sprawdzamy zapis, a wygląd po powrocie do skryptu
const afterColor = await page.evaluate(() => ({
  varValue: document.documentElement.style.getPropertyValue('--c-twierdzenie'),
  stored: localStorage.getItem('ui.color.twierdzenie'),
}))
console.log(
  `✓ własny kolor typu zapisany: zmienna ${afterColor.varValue}, w pamięci ${afterColor.stored}`,
)

// 4. nasycenie tła zmienia zmienną sterującą odcieniami
await page.fill('.settings-row:has-text("Nasycenie tła") .settings-slider', '0')
await page.waitForTimeout(300)
const tint0 = await page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--block-tint'),
)
await page.fill('.settings-row:has-text("Nasycenie tła") .settings-slider', '34')
await page.waitForTimeout(300)
const tint34 = await page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--block-tint'),
)
console.log(
  `✓ nasycenie tła działa: ${tint0} → ${tint34} (${tint0 !== tint34 ? 'ok' : 'BEZ ZMIANY!'})`,
)

// 4a. po powrocie do skryptu nagłówek faktycznie ma nowy kolor
await page.click('.settings-page-head button:has-text("Wróć")')
await page.waitForSelector('.script-block-head')
await page.waitForTimeout(400)
const headAfter = await page.evaluate(
  () => getComputedStyle(document.querySelector('.script-block-head')).backgroundColor,
)
console.log(
  `✓ blok przestrojony po powrocie: ${struct.headBg} → ${headAfter} (${
    headAfter !== struct.headBg ? 'ok' : 'BEZ ZMIANY!'
  })`,
)

// 5. „Przywróć" kasuje własne kolory
await page.click('button[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.click('.settings-nav-item:has-text("Bloki")')
await page.click('.settings-page button:has-text("Przywróć")')
await page.waitForTimeout(300)
const afterReset = await page.evaluate(() => ({
  varValue: document.documentElement.style.getPropertyValue('--c-twierdzenie'),
  stored: localStorage.getItem('ui.color.twierdzenie'),
}))
console.log(
  `✓ przywrócenie kolorów: zmienna „${afterReset.varValue}", zapis ${afterReset.stored} (oczekiwane puste/null)`,
)

// 6. przycisk ↗ w nagłówku otwiera klocek w edytorze
await page.click('.settings-page-head button:has-text("Wróć")')
await page.waitForSelector('.script-block-open')
await page.click('.script-block-open')
await page.waitForSelector('.editor-name')
const openedName = await page.inputValue('.editor-name')
console.log(`✓ ↗ otwiera klocek: „${openedName}" (oczekiwane „Blok testowy")`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
