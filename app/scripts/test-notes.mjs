// Test okna notatek/komentarzy: zawijanie długich wierszy (brak przewijania
// w bok), tryby Wizualny/Kod/Podział, pisanie ze wzorami, zapis treści.
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
page.on('dialog', (d) => d.accept('Ścieżka notatek'))

const LONG =
  'To jest bardzo długie zdanie testowe, które zdecydowanie nie mieści się w jednej linii okna edycji notatki i musi zostać zawinięte do kolejnych wierszy zamiast zmuszać do przewijania w bok.'

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')
await page.click('button[title*="Nowa ścieżka"]')
await nazwij(page, "Ścieżka notatek")
await page.waitForSelector('.path-canvas')

// notatka na mapie + otwarcie okna edycji
await page.click('button[title*="tkankę łączną"]')
await page.waitForSelector('.path-node-text')
await page.dblclick('.path-node-text .path-node-notebody')
await page.waitForSelector('.note-modal')
console.log('✓ okno notatki otwarte')

// 1. domyślnie tryb wizualny (pisanie, nie wklejanie do kodu)
const hasRich = await page.locator('.note-modal .rich-content .tiptap').count()
console.log(`✓ domyślnie tryb wizualny: ${hasRich > 0 ? 'ok' : 'BRAK!'}`)

// 2. linijka strony schowana (okno to nie strona)
const rulerInModal = await page.locator('.note-modal .page-ruler').count()
console.log(`✓ linijka strony schowana w oknie: ${rulerInModal === 0 ? 'ok' : 'JEST!'}`)

// 3. pisanie w wizualnym: długi tekst zawija się, wzór renderuje w miejscu
await page.click('.note-modal .rich-content .tiptap')
await page.keyboard.type(LONG + ' Wzór $E = mc^2$ w tekście.')
await page.waitForTimeout(700)
const visual = await page.evaluate(() => {
  const el = document.querySelector('.note-modal .rich-content .tiptap')
  const p = el.querySelector('p')
  return {
    overflow: el.scrollWidth - el.clientWidth,
    lines: Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight)),
    katex: document.querySelectorAll('.note-modal .katex').length,
  }
})
console.log(
  `✓ wizualny: tekst w ${visual.lines} liniach, przewijanie w bok ${visual.overflow}px (oczekiwane 0), wzory KaTeX: ${visual.katex}`,
)

// 4. tryb Kod: zawijanie wierszy zamiast poziomego paska
await page.click('.note-modal .view-switch button:has-text("Kod")')
await page.waitForSelector('.note-modal .cm-content')
await page.waitForTimeout(300)
const code = await page.evaluate(() => {
  const scroller = document.querySelector('.note-modal .cm-scroller')
  const line = document.querySelector('.note-modal .cm-line')
  return {
    overflow: scroller.scrollWidth - scroller.clientWidth,
    lineHeight: Math.round(line.getBoundingClientRect().height),
    text: document.querySelector('.note-modal .cm-content').textContent.slice(0, 40),
  }
})
console.log(
  `✓ kod: przewijanie w bok ${code.overflow}px (oczekiwane 0), wysokość wiersza ${code.lineHeight}px (zawinięty = kilka linii)`,
)
console.log(`✓ treść zachowana w kodzie: „${code.text}…"`)

// 5. tryb Podział: kod + podgląd obok siebie
await page.click('.note-modal .view-switch button:has-text("Podział")')
await page.waitForSelector('.note-modal .editor-preview')
const cols = await page.evaluate(
  () => getComputedStyle(document.querySelector('.note-modal-body')).gridTemplateColumns,
)
console.log(`✓ podział na dwie kolumny: ${cols.split(' ').length === 2 ? 'ok' : 'BŁĄD: ' + cols}`)

// 6. treść zapisana w ścieżce po zamknięciu
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
const saved = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction('paths', 'readonly')
  const all = await new Promise((res) => {
    const r = tx.objectStore('paths').getAll()
    r.onsuccess = () => res(r.result)
  })
  const p = all.find((x) => x.name === 'Ścieżka notatek')
  return p?.nodes.find((n) => n.kind === 'text')?.text ?? ''
})
console.log(
  `✓ treść notatki zapisana: ${saved.includes('bardzo długie') && saved.includes('$E = mc^2$') ? 'ok' : 'BŁĄD: ' + saved.slice(0, 80)}`,
)

// 7. wybrany tryb pamiętany po ponownym otwarciu
await page.dblclick('.path-node-text .path-node-notebody')
await page.waitForSelector('.note-modal')
const remembered = await page.locator('.note-modal .editor-preview').count()
console.log(`✓ tryb zapamiętany (Podział): ${remembered > 0 ? 'ok' : 'BRAK!'}`)

// 8. to samo zawijanie w widoku Kod klocka
await page.keyboard.press('Escape')
await page.click('.path-canvas .btn-close')
await page.click('.sidebar-create-btn[title="Nowy klocek"]')
await page.waitForSelector('.editor-name')
await page.click('.view-switch button:has-text("Kod")')
await page.click('.editor-code .cm-content')
await page.keyboard.type(LONG)
await page.waitForTimeout(400)
const blockCode = await page.evaluate(() => {
  const s = document.querySelector('.editor-code .cm-scroller')
  return s.scrollWidth - s.clientWidth
})
console.log(`✓ widok Kod klocka też zawija: przewijanie w bok ${blockCode}px (oczekiwane 0)`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
