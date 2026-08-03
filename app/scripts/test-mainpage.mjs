// Test nazwy strony głównej klocka oraz źródeł wspólnych dla wszystkich stron:
// źródło można podpiąć z dowolnej strony i nie zmienia się przy ich przełączaniu.
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

const answers = ['Sformułowanie', 'Dowód']
page.on('dialog', (d) => d.accept(answers.shift() ?? 'X'))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.rich-content .tiptap')
await page.fill('.editor-name', 'Twierdzenie o stronach')
await page.click('.rich-content .tiptap')
await page.keyboard.type('Treść główna.')
await page.waitForTimeout(500)

// 1. zmiana nazwy strony głównej
await page.click('.subpage-item.active button[title*="Zmień nazwę strony głównej"]')
await page.waitForTimeout(600)
const railName = await page.textContent('.subpage-item.active .subpage-name')
console.log(`✓ nazwa strony głównej zmieniona: „${railName}" (oczekiwane „Sformułowanie")`)

const stored = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction('concepts', 'readonly')
  const all = await new Promise((res) => {
    const r = tx.objectStore('concepts').getAll()
    r.onsuccess = () => res(r.result)
  })
  return all[0]?.mainPageName
})
console.log(`✓ nazwa zapisana w bazie: „${stored}"`)

// 2. dodaj stronę „Dowód" i przełącz się na nią
await page.click('.subpage-add')
await page.waitForSelector('.subpage-item.active:has-text("Dowód")')
await page.click('.rich-content .tiptap')
await page.keyboard.type('Dowód indukcyjny.')
await page.waitForTimeout(600)

// 3. źródło podpinane Z POZIOMU strony „Dowód"
await page.setInputFiles('input[type=file][accept="application/pdf"]', 'scripts/test-multi.pdf')
await page.waitForSelector('.pdf-page-wrap canvas')
await page.waitForTimeout(1200)
const btn = page.locator('button:has-text("Podepnij źródło")')
console.log(
  `✓ przycisk podpinania aktywny na stronie „Dowód": ${
    (await btn.isDisabled()) ? 'ZABLOKOWANY!' : 'ok'
  }`,
)
await btn.click()
await page.waitForSelector('.pdf-banner')
const c = await page.locator('.pdf-page-wrap canvas').first().boundingBox()
await page.mouse.move(c.x + 40, c.y + 50)
await page.mouse.down()
await page.mouse.move(c.x + 320, c.y + 120, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(800)
const chipsOnSub = await page.locator('.source-chip').count()
console.log(`✓ źródło podpięte ze strony „Dowód": ${chipsOnSub} (oczekiwane 1)`)

// 4. te same źródła po powrocie na stronę główną
await page.click('.subpage-item:has-text("Sformułowanie")')
await page.waitForTimeout(400)
const chipsOnMain = await page.locator('.source-chip').count()
console.log(
  `✓ źródła wspólne dla stron: na głównej ${chipsOnMain} (oczekiwane 1, bez zmian)`,
)
const mainTxt = await page.textContent('.rich-content .tiptap')
console.log(
  `✓ treść stron nadal osobna: ${mainTxt.includes('Treść główna') && !mainTxt.includes('indukcyjny') ? 'ok' : 'BŁĄD'}`,
)

// 5. źródło zapisane w wersji (nie w stronie)
const inVersion = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction(['versions', 'subpages'], 'readonly')
  const vs = await new Promise((res) => {
    const r = tx.objectStore('versions').getAll()
    r.onsuccess = () => res(r.result)
  })
  const subs = await new Promise((res) => {
    const r = tx.objectStore('subpages').getAll()
    r.onsuccess = () => res(r.result)
  })
  return {
    wWersji: vs[0]?.sourceRefs?.length ?? 0,
    stronaMaPoleZrodel: Object.prototype.hasOwnProperty.call(subs[0] ?? {}, 'sourceRefs'),
  }
})
console.log(
  `✓ źródło należy do wersji: ${inVersion.wWersji} szt.; strona nie ma własnych źródeł: ${!inVersion.stronaMaPoleZrodel}`,
)

// 6. własna nazwa strony głównej widoczna w ścieżce (Skrypt)
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.click('button[title*="Nowa ścieżka"]')
await nazwij(page, "Ścieżka")
await page.waitForSelector('.path-canvas')
await page.dragAndDrop('.concept-item:has-text("Twierdzenie o stronach")', '.path-flow', {
  targetPosition: { x: 400, y: 200 },
})
await page.waitForSelector('.path-node')
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-block')
await page.waitForTimeout(500)
const tabs = await page.evaluate(() =>
  [...document.querySelectorAll('.script-block .block-page')].map((b) => b.textContent),
)
console.log(`✓ zakładki stron w Skrypcie: ${tabs.join(' | ')}`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
