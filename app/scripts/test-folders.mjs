// Test folderów: tworzenie, przeciąganie klocków do folderów, zmiana
// kolejności przeciąganiem, foldery w bibliotece PDF.
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

// minimalny PDF (1 strona)
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

// kolejka odpowiedzi na window.prompt
const answers = ['Topologia', 'Zbiory']
page.on('dialog', (d) => d.accept(answers.shift() ?? ''))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// trzy klocki: A, B, C
for (const name of ['Klocek A', 'Klocek B', 'Klocek C']) {
  await page.click('text=+ Nowy klocek')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.waitForTimeout(150)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}

// folder na klocki
await page.click('button[title="Nowy folder"]')
await page.waitForSelector('.folder-row:has-text("Topologia")')
console.log('✓ folder utworzony')

// przeciągnij Klocek A do folderu
await page.dragAndDrop(
  '.concept-item:has-text("Klocek A")',
  '.folder-row:has-text("Topologia")',
)
await page.waitForSelector('.folder-children .concept-item:has-text("Klocek A")')
console.log('✓ klocek przeciągnięty do folderu (folder sam się rozwinął)')

// zmiana kolejności: przeciągnij C nad B (górna połowa = przed)
await page.dragAndDrop(
  '.concept-item:has-text("Klocek C")',
  '.concept-item:has-text("Klocek B")',
  { targetPosition: { x: 60, y: 5 } },
)
await page.waitForTimeout(300)
const names = await page.$$eval('.concept-list > li .concept-name', (els) =>
  els.map((e) => e.textContent),
)
console.log('✓ kolejność po przeciągnięciu:', names.join(' | '))

// biblioteka PDF: import, folder, przeciągnięcie
await page.setInputFiles('input[type=file]', 'scripts/test.pdf')
await page.waitForSelector('.pdf-page-wrap canvas', { timeout: 15000 })
await page.click('.pdf-lib-toggle')
await page.waitForSelector('.pdf-library')
await page.click('.pdf-library button[title="Nowy folder"]')
await page.waitForSelector('.pdf-library .folder-row:has-text("Zbiory")')
await page.dragAndDrop(
  '.pdflib-item:has-text("test")',
  '.pdf-library .folder-row:has-text("Zbiory")',
)
await page.waitForTimeout(300)
const count = await page.textContent(
  '.pdf-library .folder-row:has-text("Zbiory") .folder-count',
)
console.log('✓ PDF w folderze biblioteki, licznik folderu:', count)
await page.screenshot({ path: 'scripts/shot-8-foldery.png' })

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
