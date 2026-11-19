// Test Context-Lock: import PDF → zaznaczenie prostokątem → chip źródła → skok.
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

// --- wygeneruj minimalny, poprawny PDF (2 strony) ---
function makePdf() {
  const objs = []
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>'
  objs[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'
  const s1 = 'BT /F1 24 Tf 72 700 Td (Strona 1: definicja metryki) Tj ET'
  objs[4] = `<< /Length ${s1.length} >>\nstream\n${s1}\nendstream`
  objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  objs[6] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 7 0 R /Resources << /Font << /F1 5 0 R >> >> >>'
  const s2 = 'BT /F1 24 Tf 72 700 Td (Strona 2: twierdzenie) Tj ET'
  objs[7] = `<< /Length ${s2.length} >>\nstream\n${s2}\nendstream`

  let out = '%PDF-1.4\n'
  const offsets = [0]
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`
  for (let i = 1; i < objs.length; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
writeFileSync('scripts/test.pdf', makePdf())

// --- przepływ w aplikacji ---
const errors = []
const browser = await chromium.launch({
  executablePath: process.env.KOMP_PRZEGLADARKA ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// kafelek
await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
await page.fill('.editor-name', 'Metryka — test źródła')

// import PDF
await page.setInputFiles('input[type=file][accept*="pdf"]', 'scripts/test.pdf')
await page.waitForSelector('.pdf-page-wrap canvas', { timeout: 15000 })
await page.waitForTimeout(500)

// tryb podpinania + zaznaczenie prostokątem
await page.click('button:has-text("Podepnij źródło")')
await page.waitForSelector('.pdf-banner')
// widok ciągły: wszystkie strony pod sobą — bierzemy pierwszą
const canvas = await page.locator('.pdf-page-wrap canvas').first().boundingBox()
await page.mouse.move(canvas.x + 40, canvas.y + 40)
await page.mouse.down()
await page.mouse.move(canvas.x + 300, canvas.y + 120, { steps: 5 })
await page.mouse.up()

// chip źródła powinien się pojawić
await page.waitForSelector('.source-chip', { timeout: 10000 })
await page.screenshot({ path: 'scripts/shot-4-zrodlo.png' })

// przewiń na stronę 2, potem skocz z powrotem przez chip
await page.fill('.pdf-page-input', '2')
await page.waitForTimeout(600)
await page.click('.source-jump')
await page.waitForSelector('.pdf-highlight', { timeout: 10000 })
await page.waitForTimeout(600)
await page.screenshot({ path: 'scripts/shot-5-skok.png' })

const jumped = await page.evaluate(() => {
  const h = document.querySelector('.pdf-highlight')
  return h?.closest('.pdf-page-wrap')?.dataset.page
})
console.log(`Skok do źródła: podświetlenie na stronie ${jumped} (oczekiwana 1)`)
console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
