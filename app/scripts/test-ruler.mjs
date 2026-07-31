// Test linijki szerokości strony (trójkąciki à la Google Docs) i menu
// odstępów tekstu (interlinia + odstęp akapitów) w edytorze wizualnym.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
// szeroki viewport: kolumna edytora musi być szersza niż domyślne 800px,
// żeby znaczniki szerokości domyślnej miały gdzie się pokazać
const page = await browser.newPage({ viewport: { width: 2000, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

await page.click('text=+ Nowy klocek')
await page.waitForSelector('.rich-content .tiptap')
await page.fill('.editor-name', 'Linijka')

// 1. linijka widoczna, dwa trójkąciki
await page.waitForSelector('.page-ruler')
const handles = await page.locator('.ruler-handle').count()
console.log(`✓ linijka nad edytorem, uchwyty: ${handles === 2 ? 'ok (2)' : 'BRAK! ' + handles}`)

// 2. marginesy mają inne tło niż kolumna tekstu
const bgs = await page.evaluate(() => {
  const content = getComputedStyle(document.querySelector('.rich-content')).backgroundColor
  const col = getComputedStyle(document.querySelector('.rich-content .tiptap')).backgroundColor
  return { content, col }
})
console.log(
  `✓ tło marginesów inne niż kolumny: ${bgs.content !== bgs.col} (${bgs.content} vs ${bgs.col})`,
)

// 3. przeciągnięcie prawego trójkącika zmienia szerokość globalnie
const before = await page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--page-width'),
)
const right = page.locator('.ruler-handle').nth(1)
const box = await right.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 8 })
// w trakcie przeciągania widać etykietę z wartością
const labelVisible = await page.locator('.ruler-label').isVisible()
await page.mouse.up()
const after = await page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--page-width'),
)
const stored = await page.evaluate(() => localStorage.getItem('ui.pageWidth'))
console.log(
  `✓ przeciąganie: ${before} → ${after} (etykieta px w trakcie: ${labelVisible}), localStorage: ${stored}`,
)
if (before === after) console.log('BŁĄD: szerokość nie zmieniła się!')

// 4. kreseczki szerokości domyślnej widoczne, gdy szerokość ≠ domyślna
const defMarks = await page.locator('.ruler-default').count()
console.log(`✓ znaczniki szerokości domyślnej: ${defMarks === 2 ? 'ok (2)' : 'BRAK! ' + defMarks}`)

// 5. dwuklik trójkąta przywraca domyślną (800px)
await right.dblclick()
const restored = await page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--page-width'),
)
console.log(`✓ dwuklik → domyślna: ${restored === '800px' ? 'ok' : 'BRAK! ' + restored}`)

// 6. menu odstępów: interlinia 2,0 zmienia line-height treści
await page.click('.spacing-menu .rich-btn')
await page.waitForSelector('.spacing-pop')
await page.click('.spacing-opt:has-text("2,0")')
const lh = await page.evaluate(() => {
  const el = document.querySelector('.rich-content .tiptap')
  const fs = parseFloat(getComputedStyle(el).fontSize)
  return parseFloat(getComputedStyle(el).lineHeight) / fs
})
console.log(`✓ interlinia 2,0 → line-height/font-size = ${lh.toFixed(2)} (oczekiwane ~2)`)

// 7. odstęp akapitów „Brak" → margines p = 0
await page.click('.spacing-opt:has-text("Brak")')
await page.click('.rich-content .tiptap')
await page.keyboard.type('akapit pierwszy')
await page.keyboard.press('Enter')
await page.keyboard.type('akapit drugi')
await page.waitForTimeout(300)
const pm = await page.evaluate(() => {
  const p = document.querySelector('.rich-content .tiptap p')
  const s = getComputedStyle(p)
  return `${s.marginTop} / ${s.marginBottom}`
})
console.log(`✓ odstęp „Brak" → marginesy akapitu: ${pm} (oczekiwane 0px / 0px)`)

// 8. zamknięcie menu Escape
await page.keyboard.press('Escape')
const popGone = (await page.locator('.spacing-pop').count()) === 0
console.log(`✓ Escape zamyka menu odstępów: ${popGone}`)

// 9. trwałość po przeładowaniu
await page.evaluate(() => localStorage.setItem('ui.pageWidth', '1000'))
await page.reload()
await page.waitForSelector('text=Kompendium')
const persisted = await page.evaluate(() => ({
  w: document.documentElement.style.getPropertyValue('--page-width'),
  line: document.documentElement.style.getPropertyValue('--content-line'),
  para: document.documentElement.style.getPropertyValue('--content-para'),
}))
console.log(
  `✓ po przeładowaniu: szerokość ${persisted.w} (oczekiwane 1000px), interlinia ${persisted.line} (oczekiwane 2), akapity ${persisted.para} (oczekiwane 0em)`,
)

// 10. suwak w Ustawieniach pokazuje wartość z linijki
await page.click('button[title="Ustawienia"]')
await page.waitForSelector('.settings-modal')
const slider = await page.inputValue('.settings-slider')
console.log(`✓ suwak w Ustawieniach zsynchronizowany: ${slider} (oczekiwane 1000)`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
