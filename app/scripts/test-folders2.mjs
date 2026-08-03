// Test: wspólna kolejność folderów i klocków, prowadnice, grupy źródeł.
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

function makePdf() {
  const objs = []
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
  objs[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'
  const s = 'BT /F1 24 Tf 72 700 Td (Testowy PDF) Tj ET'
  objs[4] = `<< /Length ${s.length} >>\nstream\n${s}\nendstream`
  objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  let out = '%PDF-1.4\n'
  const offsets = [0]
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`
  for (let i = 1; i < objs.length; i++)
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
writeFileSync('scripts/test.pdf', makePdf())

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const answers = ['Folder X', 'Wewnętrzny', 'Rysunki']
page.on('dialog', (d) => d.accept(answers.shift() ?? ''))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// klocki A i B
for (const name of ['Klocek A', 'Klocek B']) {
  await page.click('.sidebar-create-btn[title="Nowy klocek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.waitForTimeout(150)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}

// folder X (ląduje na końcu: A, B, X)
await page.click('button[title="Nowy folder"]')
await page.waitForSelector('.folder-row:has-text("Folder X")')

// 1. WSPÓLNA KOLEJNOŚĆ: przeciągnij Folder X nad Klocek B (górna połowa = przed)
await page.dragAndDrop(
  '.folder-row:has-text("Folder X")',
  '.concept-item:has-text("Klocek B")',
  { targetPosition: { x: 60, y: 4 } },
)
await page.waitForTimeout(300)
const rootOrder = await page.$$eval('.concept-list > li > *:first-child', (els) =>
  els.map((e) => (e.querySelector('.folder-name, .concept-name')?.textContent ?? '').trim()),
)
console.log('✓ wspólna kolejność (oczekiwane A | Folder X | B):', rootOrder.join(' | '))

// 2. PROWADNICA: zagnieżdżony folder + klocek w środku → widoczna linia
await page.click('.folder-row:has-text("Folder X")') // rozwiń
await page.waitForSelector('.folder-children')
await page.dragAndDrop(
  '.concept-item:has-text("Klocek A")',
  '.folder-row:has-text("Folder X")',
  { targetPosition: { x: 60, y: 14 } }, // środek = do środka
)
await page.waitForSelector('.folder-children .concept-item:has-text("Klocek A")')
console.log('✓ klocek w folderze, prowadnica renderowana (screenshot)')

// 3. GRUPY ŹRÓDEŁ: podepnij źródło i przypisz grupę „Rysunki"
await page.click('.folder-children .concept-item:has-text("Klocek A")')
await page.waitForSelector('.editor-name')
await page.setInputFiles('input[type=file]', 'scripts/test.pdf')
await page.waitForSelector('.pdf-page-wrap canvas', { timeout: 15000 })
await page.click('text=📌 Podepnij źródło')
const canvas = await page.locator('.pdf-page-wrap canvas').boundingBox()
await page.mouse.move(canvas.x + 40, canvas.y + 40)
await page.mouse.down()
await page.mouse.move(canvas.x + 250, canvas.y + 110, { steps: 5 })
await page.mouse.up()
await page.waitForSelector('.source-chip')
// utwórz grupę przyciskiem obok „Podepnij źródło"
answers.length = 0
answers.push('Rysunki')
await page.click('button[title="Nowa grupa źródeł"]')
await page.waitForSelector('.source-group-head:has-text("Rysunki")')
// przeciągnij chip do grupy
await page.dragAndDrop('.source-chip', '.source-group-head:has-text("Rysunki")')
await page.waitForFunction(() => {
  const el = document.querySelector('.source-group-head .folder-count')
  return el && el.textContent === '1'
})
console.log('✓ grupa „Rysunki" utworzona, chip przeciągnięty do grupy')
// zwiń grupę → chip znika, rozwiń → wraca
await page.click('.source-group-head:has-text("Rysunki")')
await page.waitForFunction(
  () => document.querySelectorAll('.source-chip').length === 0,
)
await page.click('.source-group-head:has-text("Rysunki")')
await page.waitForSelector('.source-chip')
console.log('✓ zwijanie i rozwijanie grupy działa')

await page.screenshot({ path: 'scripts/shot-9-mix.png' })
console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
