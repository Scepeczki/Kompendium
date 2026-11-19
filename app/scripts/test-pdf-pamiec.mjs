// Panel PDF pamięta, co było otwarte: po schowaniu i ponownym pokazaniu (oraz
// po przeładowaniu strony) wraca ten sam PDF, na tej samej stronie i w tym
// samym powiększeniu. Każdy PDF ma swoje miejsce osobno.
import { existsSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

// wielostronicowy PDF (ten sam co w test-pdfview)
function makePdf(pages = 6) {
  const objs = []
  const kids = []
  let next = 3
  const pageObjs = []
  for (let i = 0; i < pages; i++) {
    const pageNo = next++
    const contentNo = next++
    kids.push(`${pageNo} 0 R`)
    pageObjs.push({ pageNo, contentNo, i })
  }
  const fontNo = next++
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`
  for (const { pageNo, contentNo, i } of pageObjs) {
    objs[pageNo] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNo} 0 R ` +
      `/Resources << /Font << /F1 ${fontNo} 0 R >> >> >>`
    const s = `BT /F1 36 Tf 72 700 Td (STRONA ${i + 1}) Tj ET`
    objs[contentNo] = `<< /Length ${s.length} >>\nstream\n${s}\nendstream`
  }
  objs[fontNo] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

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
if (!existsSync('scripts/test-multi.pdf')) writeFileSync('scripts/test-multi.pdf', makePdf(6))

const problems = []
const errors = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problems.push(nazwa)
}

const browser = await chromium.launch({
  executablePath: process.env.KOMP_PRZEGLADARKA ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

await page.setInputFiles('input[type=file][accept="application/pdf"]', 'scripts/test-multi.pdf')
await page.waitForSelector('.pdf-page-wrap canvas')
await page.waitForTimeout(1000)

const stronaNaGorze = () =>
  page.evaluate(() => {
    const s = document.querySelector('.pdf-scroll')
    const top = s.getBoundingClientRect().top
    const w = [...document.querySelectorAll('.pdf-page-wrap')].find((x) => x.getBoundingClientRect().bottom > top + 40)
    return Number(w?.dataset.page ?? 0)
  })

// powiększenie i przewinięcie do strony 4
await page.click('.pdf-nav button[title="Powiększ"]')
await page.waitForTimeout(600)
await page.fill('.pdf-page-input', '4')
await page.waitForTimeout(900)
const szer = (await page.locator('.pdf-page-wrap').first().boundingBox()).width
check('przed schowaniem: strona 4', (await stronaNaGorze()) === 4, String(await stronaNaGorze()))

// schowaj panel i pokaż znowu
await page.click('.pdf-panel .btn-close[title="Schowaj panel PDF"]')
await page.waitForTimeout(400)
check('panel schowany', (await page.locator('.pdf-panel').count()) === 0)
await page.click('.pdf-reopen')
await page.waitForSelector('.pdf-page-wrap canvas')
await page.waitForTimeout(1000)
check('po ponownym otwarciu ten sam PDF (bez biblioteki)', (await page.locator('.pdf-page-wrap').count()) === 6)
check('po ponownym otwarciu ta sama strona', (await stronaNaGorze()) === 4, String(await stronaNaGorze()))
const szer2 = (await page.locator('.pdf-page-wrap').first().boundingBox()).width
check('po ponownym otwarciu to samo powiększenie', Math.abs(szer2 - szer) < 3, `${Math.round(szer)} → ${Math.round(szer2)}`)

// przewinięcie na stronę 2 i przeładowanie całej aplikacji
await page.fill('.pdf-page-input', '2')
await page.waitForTimeout(900)
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForSelector('.pdf-page-wrap canvas')
await page.waitForTimeout(1200)
check('po przeładowaniu: ten sam PDF na stronie 2', (await stronaNaGorze()) === 2, String(await stronaNaGorze()))

// powrót do biblioteki: przy następnym otwarciu biblioteka, nie PDF
await page.click('.pdf-toolbar button[title="Wróć do biblioteki PDF-ów"]')
await page.waitForTimeout(300)
await page.click('.pdf-panel .btn-close[title="Schowaj panel PDF"]')
await page.click('.pdf-reopen')
await page.waitForTimeout(800)
check('zamknięty z biblioteki — otwiera się biblioteka', (await page.locator('.pdf-page-wrap').count()) === 0)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(problems.length === 0 ? '>>> WSZYSTKO POPRAWNE' : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`)
await browser.close()
if (problems.length || errors.length) process.exit(1)
