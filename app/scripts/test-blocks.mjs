// Test stylistyki bloków w Skrypcie (pasek nagłówka w kolorze typu, treść
// z akcentem) oraz ustawień kolorów i nasycenia tła.
import { chromium } from 'playwright'
import { nazwij } from './lib.mjs'

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

// kafelek typu Twierdzenie + ścieżka z nim
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Blok testowy')
await page.selectOption('.type-select', 'twierdzenie')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.type('Treść twierdzenia $a^2$.')
await page.waitForTimeout(500)
await page.click('.btn-close[title*="Zamknij kafelek"]')

await page.click('button[title*="Nowa ścieżka"]')
await nazwij(page, "Ścieżka")
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

// 3. zmiana barwy typu w edytorze typów przestraja blok.
// Barwy siedzą w bazie (tabela blockTypes), nie w localStorage — sprawdzamy
// więc zapis w bazie, a wygląd po powrocie do Skryptu.
await page.click('button[title="Ustawienia"]')
await page.waitForSelector('.settings-page')
await page.click('.settings-nav-item:has-text("Typy kafelków")')
await page.waitForSelector('.type-row')
await page.fill('.type-row:has(input[value="Twierdzenie"]) .type-row-color', '#c81e4a')
await page.waitForTimeout(400)
const afterColor = await page.evaluate(
  () =>
    new Promise((res) => {
      const r = indexedDB.open('kompendium')
      r.onsuccess = () => {
        const tx = r.result.transaction('blockTypes').objectStore('blockTypes').get('twierdzenie')
        tx.onsuccess = () => res(tx.result?.color ?? '(brak)')
      }
    }),
)
console.log(`✓ własna barwa typu zapisana w bazie: ${afterColor}`)

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

// 5. barwa przeżywa przeładowanie (siedzi w bazie, nie w pamięci ekranu)
await page.reload()
await page.waitForSelector('text=Kompendium')
// widok nie jest zapamiętywany — wracamy do Skryptu tej samej ścieżki
await page.click('.concept-item.path-item')
await page.waitForSelector('.path-canvas')
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-block-head')
await page.waitForTimeout(500)
const headAfterReload = await page.evaluate(
  () => getComputedStyle(document.querySelector('.script-block-head')).backgroundColor,
)
console.log(
  `✓ barwa typu po przeładowaniu: ${headAfterReload} (${
    headAfterReload === headAfter ? 'ok' : 'ZMIENIŁA SIĘ!'
  })`,
)

// 6. przycisk ↗ w nagłówku otwiera kafelek w edytorze
await page.waitForSelector('.script-block-open')
await page.click('.script-block-open')
await page.waitForSelector('.editor-name')
const openedName = await page.inputValue('.editor-name')
console.log(`✓ ↗ otwiera kafelek: „${openedName}" (oczekiwane „Blok testowy")`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
