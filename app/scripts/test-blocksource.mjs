// Test źródeł-klocków: klocek podsumowujący wskazuje inne klocki jako źródła,
// powstaje genealogia (podsumowanie → klocek z książki → wycinek PDF).
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
page.on('dialog', (d) => d.accept('Podsumowanie'))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// dwa klocki „z książek", pierwszy ze źródłem w PDF
const mkBlock = async (name, content) => {
  await page.click('.sidebar-create-btn[title="Nowy klocek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(content)
  await page.waitForTimeout(500)
}

await mkBlock('Funkcja wg Ksiazki A', 'Definicja funkcji wg pierwszego autora.')
await page.setInputFiles('input[type=file][accept="application/pdf"]', 'scripts/test-multi.pdf')
await page.waitForSelector('.pdf-page-wrap canvas')
await page.waitForTimeout(1200)
await page.click('text=📌 Podepnij źródło')
await page.waitForSelector('.pdf-banner')
const c = await page.locator('.pdf-page-wrap canvas').first().boundingBox()
await page.mouse.move(c.x + 40, c.y + 50)
await page.mouse.down()
await page.mouse.move(c.x + 320, c.y + 120, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(700)
await page.click('.btn-close[title*="Zamknij klocek"]')

await mkBlock('Funkcja wg Ksiazki B', 'Definicja funkcji wg drugiego autora.')
await page.click('.btn-close[title*="Zamknij klocek"]')

// klocek podsumowujący — źródłami są dwa poprzednie klocki
await mkBlock('Funkcja (moje ujecie)', 'Synteza obu ujęć.')

const pick = async (name) => {
  await page.click('button:has-text("Klocek jako źródło")')
  await page.waitForSelector('.picker-modal')
  await page.fill('.picker-search', name)
  await page.waitForTimeout(300)
  await page.click(`.picker-item:has-text("${name}")`)
  await page.waitForTimeout(600)
}
await pick('Funkcja wg Ksiazki A')
await pick('Funkcja wg Ksiazki B')

const chips = await page.evaluate(() =>
  [...document.querySelectorAll('.source-chip .source-jump')].map((b) => b.textContent.trim()),
)
console.log(`✓ źródła klocka podsumowującego: ${chips.join(' | ')}`)
console.log(
  `✓ oba to klocki (ikona 🧱): ${chips.every((t) => t.startsWith('🧱')) ? 'ok' : 'BŁĄD'}`,
)

// 1. zapis w bazie: kind=block, wskazanie na conceptId
const stored = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction(['versions', 'concepts'], 'readonly')
  const vs = await new Promise((res) => {
    const r = tx.objectStore('versions').getAll()
    r.onsuccess = () => res(r.result)
  })
  const cs = await new Promise((res) => {
    const r = tx.objectStore('concepts').getAll()
    r.onsuccess = () => res(r.result)
  })
  const sum = cs.find((x) => x.name.includes('moje ujecie'))
  const v = vs.find((x) => x.id === sum.currentVersionId)
  return v.sourceRefs.map((r) => ({
    kind: r.kind ?? 'pdf',
    cel: cs.find((x) => x.id === r.conceptId)?.name ?? r.pdfId,
  }))
})
console.log(`✓ zapis w bazie: ${JSON.stringify(stored)}`)

// 2. brak duplikatów przy powtórnym wskazaniu tego samego klocka
await pick('Funkcja wg Ksiazki A')
const afterDup = await page.locator('.source-chip').count()
console.log(`✓ powtórne wskazanie nie dubluje: ${afterDup} (oczekiwane 2)`)

// 3. klik w źródło-klocek otwiera ten klocek (wędrówka w górę genealogii)
await page.click('.source-chip .source-jump:has-text("Ksiazki A")')
await page.waitForTimeout(700)
const opened = await page.inputValue('.editor-name')
console.log(`✓ skok do klocka-źródła: „${opened}"`)

// 4. w tym klocku źródłem jest wycinek PDF → pełny łańcuch do książki
const deeper = await page.evaluate(() =>
  [...document.querySelectorAll('.source-chip .source-jump')].map((b) => b.textContent.trim()),
)
console.log(`✓ genealogia: „Funkcja (moje ujecie)" → „Ksiazki A" → ${deeper.join(', ')}`)

// 5. lista źródeł w Skrypcie pokazuje oba rodzaje i podgląd klocka
await page.click('.btn-close[title*="Zamknij klocek"]')
await page.click('button[title*="Nowa ścieżka"]')
await page.waitForSelector('.path-canvas')
await page.dragAndDrop('.concept-item:has-text("moje ujecie")', '.path-flow', {
  targetPosition: { x: 400, y: 200 },
})
await page.waitForSelector('.path-node')
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-block')
await page.click('.source-list-toggle')
await page.waitForSelector('.source-list-item')
const listed = await page.evaluate(() =>
  [...document.querySelectorAll('.source-list-item .source-jump')].map((b) =>
    b.textContent.trim(),
  ),
)
console.log(`✓ źródła pod blokiem w Skrypcie: ${listed.join(' | ')}`)

await page.hover('.source-list-item')
await page.waitForSelector('.source-preview-block', { timeout: 15000 })
const previewText = await page.textContent('.source-preview-block')
console.log(
  `✓ podgląd klocka-źródła po najechaniu: ${previewText.includes('pierwszego autora') ? 'ok (widać treść)' : 'BRAK TREŚCI: ' + previewText.slice(0, 60)}`,
)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
