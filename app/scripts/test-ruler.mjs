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

await page.click('.sidebar-create-btn[title="Nowy klocek"]')
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

// 6a. wielkość wzorów: 100% = dokładnie rozmiar tekstu, 121% większe
await page.click('.rich-content .tiptap') // zamyka menu (klik poza nim)
await page.keyboard.type('wzór $a^2$ w tekście')
await page.waitForTimeout(500)
await page.click('.spacing-menu .rich-btn') // otwórz menu ponownie
await page.waitForSelector('.spacing-pop')
const mathFs = await page.evaluate(() => ({
  katex: getComputedStyle(document.querySelector('.rich-content .katex')).fontSize,
  text: getComputedStyle(document.querySelector('.rich-content .tiptap')).fontSize,
}))
console.log(
  `✓ wzór proporcjonalny do tekstu: ${mathFs.katex} vs ${mathFs.text} (${
    mathFs.katex === mathFs.text ? 'ok' : 'DYSPROPORCJA!'
  })`,
)
await page.click('.spacing-group:has-text("Wielkość wzorów") .spacing-opt:text-is("121%")')
await page.waitForTimeout(300)
const mathBig = await page.evaluate(
  () => getComputedStyle(document.querySelector('.rich-content .katex')).fontSize,
)
console.log(
  `✓ 121% powiększa wzory: ${mathBig} (oczekiwane 18.15px, ${
    parseFloat(mathBig) > parseFloat(mathFs.text) ? 'ok' : 'BRAK ZMIANY!'
  })`,
)
await page.click('.spacing-group:has-text("Wielkość wzorów") .spacing-opt:text-is("100%")')

// 6b. odstęp wzorów wystawionych sterowalny
const gapFor = async (label) => {
  await page.click(`.spacing-group:has-text("Odstęp wzorów") .spacing-opt:text-is("${label}")`)
  await page.waitForTimeout(250)
  return page.evaluate(
    () => getComputedStyle(document.documentElement).getPropertyValue('--math-gap').trim(),
  )
}
const gapNone = await gapFor('Brak')
const gapWide = await gapFor('Bardzo duży')
await gapFor('Zwykły')
console.log(
  `✓ odstęp wzorów sterowalny: Brak=${gapNone}, Bardzo duży=${gapWide} (${
    gapNone === '0em' && gapWide === '1.6em' ? 'ok' : 'BŁĄD!'
  })`,
)

// 7. odstęp akapitów „Brak" → margines p = 0
await page.click(
  '.spacing-group:has-text("Odstęp między akapitami") .spacing-opt:text-is("Brak")',
)
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

// 8a. znaczniki wcięć: 3 sztuki (pierwsza linia + lewy + prawy)
const indMarks = await page.locator('.ruler-ind').count()
console.log(`✓ znaczniki wcięć na linijce: ${indMarks === 3 ? 'ok (3)' : 'BRAK! ' + indMarks}`)

// 8a′. niebieski znacznik stoi dokładnie tam, gdzie zaczyna się tekst
const alignment = await page.evaluate(() => {
  const mark = document.querySelector('.ruler-ind-left').getBoundingClientRect()
  const p = document.querySelector('.rich-content .tiptap p')
  const r = document.createRange()
  r.setStart(p.firstChild, 0)
  r.setEnd(p.firstChild, 1)
  const glyph = r.getBoundingClientRect()
  const card = document.querySelector('.rich-content .tiptap').getBoundingClientRect()
  const green = document.querySelector('.ruler-handle').getBoundingClientRect()
  return {
    markVsText: Math.round(mark.left + mark.width / 2 - glyph.left),
    greenVsCard: Math.round(green.left + green.width / 2 - card.left),
  }
})
console.log(
  `✓ niebieski znacznik na początku tekstu: różnica ${alignment.markVsText}px (oczekiwane ~0)`,
)
console.log(
  `✓ zielony trójkącik na krawędzi kartki: różnica ${alignment.greenVsCard}px (oczekiwane ~0)`,
)

// 8b. przeciągnięcie lewego trójkącika wcina akapit pod kursorem (lokalnie)
await page.click('.rich-content .tiptap p')
const leftInd = page.locator('.ruler-ind-left')
const lb = await leftInd.boundingBox()
await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2)
await page.mouse.down()
await page.mouse.move(lb.x + lb.width / 2 + 60, lb.y + lb.height / 2, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(200)
const pStyle = await page.evaluate(() => {
  const p = document.querySelector('.rich-content .tiptap p')
  return getComputedStyle(p).marginLeft
})
console.log(`✓ wcięcie akapitu po przeciągnięciu: margin-left=${pStyle} (oczekiwane ~60px)`)
if (pStyle === '0px') console.log('BŁĄD: wcięcie nie zadziałało!')

// 8c. drugi akapit bez wcięcia (lokalne, nie globalne)
const p2Style = await page.evaluate(() => {
  const ps = document.querySelectorAll('.rich-content .tiptap p')
  return ps.length > 1 ? getComputedStyle(ps[1]).marginLeft : 'brak'
})
console.log(`✓ sąsiedni akapit bez wcięcia: margin-left=${p2Style} (oczekiwane 0px)`)

// 8d. prostokącik: wcięcie pierwszej linii
const firstInd = page.locator('.ruler-ind-first')
const fb = await firstInd.boundingBox()
await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2)
await page.mouse.down()
await page.mouse.move(fb.x + fb.width / 2 + 40, fb.y + fb.height / 2, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(200)
const tiStyle = await page.evaluate(() => {
  const p = document.querySelector('.rich-content .tiptap p')
  return getComputedStyle(p).textIndent
})
console.log(`✓ wcięcie pierwszej linii: text-indent=${tiStyle} (oczekiwane ~40px)`)

// 8e. w widoku Kod widać znacznik ⟦w…⟧, a treść jest nienaruszona
await page.click('.view-switch button:has-text("Kod")')
await page.waitForSelector('.editor-code .cm-content')
const codeTxt = await page.textContent('.editor-code .cm-content')
const hasMarker = /⟦w\d+,\d+(,\d+)?⟧/.test(codeTxt)
console.log(`✓ znacznik wcięcia w Kodzie: ${hasMarker ? 'ok' : 'BRAK! ' + codeTxt.slice(0, 80)}`)

// 8f. podgląd (Podział) renderuje wcięcie ze znacznika
await page.click('.view-switch button:has-text("Podział")')
await page.waitForSelector('.editor-preview')
const prevStyle = await page.evaluate(() => {
  const p = document.querySelector('.editor-preview p[style]')
  return p ? getComputedStyle(p).marginLeft : 'brak'
})
console.log(`✓ wcięcie w podglądzie: margin-left=${prevStyle} (oczekiwane ~60px)`)

// 8g. dwuklik lewego trójkącika zeruje wcięcie
await page.click('.view-switch button:has-text("Wizualny")')
await page.waitForSelector('.rich-content .tiptap')
await page.click('.rich-content .tiptap p')
await page.locator('.ruler-ind-left').dblclick()
await page.waitForTimeout(200)
const afterReset = await page.evaluate(() => {
  const p = document.querySelector('.rich-content .tiptap p')
  return getComputedStyle(p).marginLeft
})
console.log(`✓ dwuklik zeruje wcięcie akapitu: margin-left=${afterReset} (oczekiwane 0px)`)

// 8h. pisanie na początku wciętego akapitu nie psuje znacznika (samonaprawa)
await page.click('.rich-content .tiptap p')
await page.keyboard.press('Home')
await page.keyboard.type('X')
await page.waitForTimeout(400)
const healed = await page.evaluate(() => {
  const p = document.querySelector('.rich-content .tiptap p')
  return {
    ti: getComputedStyle(p).textIndent,
    visible: p.innerText.includes('⟦'),
    hasX: p.textContent.includes('X'),
  }
})
console.log(
  `✓ samonaprawa znacznika: wcięcie ${healed.ti} (oczekiwane 40px), znacznik widoczny: ${healed.visible} (oczekiwane false), litera wpisana: ${healed.hasX}`,
)

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

// 11. nowe ustawienia: bazowa szerokość strony i odsunięcie znaczników wcięć
await page.fill('.settings-row:has-text("Bazowa szerokość") .settings-slider', '900')
await page.fill('.settings-row:has-text("Odsunięcie") .settings-slider', '30')
await page.click('.settings-modal .btn-close')
await page.click('.concept-item')
await page.waitForSelector('.page-ruler .ruler-handle')
await page.locator('.ruler-handle').nth(1).dblclick()
const defW = await page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--page-width'),
)
console.log(`✓ dwuklik wraca do bazowej z ustawień: ${defW} (oczekiwane 900px)`)
const hx = (await page.locator('.ruler-handle').first().boundingBox()).x
const ix = (await page.locator('.ruler-ind-left').boundingBox()).x
console.log(`✓ odsunięcie znaczników z ustawień: ${Math.round(ix - hx)}px (oczekiwane 30)`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
