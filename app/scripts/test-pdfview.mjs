// Test widoku PDF (ciągłe przewijanie, zoom, skok do strony), usuwania PDF-ów
// z biblioteki oraz rozdziałów/podrozdziałów w ścieżce.
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { nazwij, podaj, potwierdz } from './lib.mjs'

// --- wielostronicowy PDF do testu przewijania ---
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
writeFileSync('scripts/test-multi.pdf', makePdf(6))

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

// ---------- widok PDF ----------
await page.setInputFiles('input[type=file][accept="application/pdf"]', 'scripts/test-multi.pdf')
await page.waitForSelector('.pdf-page-wrap canvas')
await page.waitForTimeout(1200)

// 1. wszystkie strony w jednej kolumnie do przewijania
const wraps = await page.locator('.pdf-page-wrap').count()
console.log(`✓ wszystkie strony w widoku: ${wraps} (oczekiwane 6)`)

// 2. brak strzałek „poprzednia/następna", jest licznik i zoom
const zoomBtn = await page.locator('.pdf-nav button:has-text("%")').count()
console.log(`✓ sterowanie zoomem zamiast strzałek: ${zoomBtn > 0 ? 'ok' : 'BRAK!'}`)

// 3. przewijanie w dół zmienia numer bieżącej strony
const before = await page.inputValue('.pdf-page-input')
await page.evaluate(() => {
  const s = document.querySelector('.pdf-scroll')
  s.scrollTop = s.scrollHeight / 2
})
await page.waitForTimeout(900)
const after = await page.inputValue('.pdf-page-input')
console.log(
  `✓ przewijanie aktualizuje numer strony: ${before} → ${after} (${
    Number(after) > Number(before) ? 'ok' : 'BEZ ZMIANY!'
  })`,
)

// 4. dalsze strony też się renderują (nie tylko pierwsza)
const painted = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('.pdf-page-wrap canvas')]
  return canvases.filter((c) => c.width > 0 && c.height > 0).length
})
console.log(`✓ narysowane strony po przewinięciu: ${painted} z ${wraps}`)

// 5. zoom powiększa stronę
const w1 = (await page.locator('.pdf-page-wrap').first().boundingBox()).width
await page.click('.pdf-nav button[title="Powiększ"]')
await page.waitForTimeout(900)
const w2 = (await page.locator('.pdf-page-wrap').first().boundingBox()).width
console.log(
  `✓ powiększanie działa: ${Math.round(w1)}px → ${Math.round(w2)}px (${w2 > w1 ? 'ok' : 'BEZ ZMIANY!'})`,
)
await page.click('.pdf-nav button[title*="Dopasuj"]')
await page.waitForTimeout(600)

// 6. wpisanie numeru strony przewija do niej
await page.fill('.pdf-page-input', '5')
await page.waitForTimeout(1000)
const scrolledTo = await page.evaluate(() => {
  const s = document.querySelector('.pdf-scroll')
  const wraps = [...document.querySelectorAll('.pdf-page-wrap')]
  const top = wraps.find((w) => w.getBoundingClientRect().bottom > s.getBoundingClientRect().top + 5)
  return top?.dataset.page
})
console.log(`✓ skok do strony 5: widoczna strona ${scrolledTo}`)

// ---------- usuwanie PDF-a ----------
await page.click('.pdf-lib-toggle')
await page.waitForSelector('.pdflib-item')
const beforeCount = await page.locator('.pdflib-item').count()
page.once('dialog', (d) => d.accept())
await page.hover('.pdflib-item')
await page.click('.pdflib-item button[title*="Usuń PDF"]')
await potwierdz(page)
await page.waitForTimeout(500)
const afterCount = await page.locator('.pdflib-item').count()
console.log(
  `✓ usuwanie PDF-a z biblioteki: ${beforeCount} → ${afterCount} (${
    afterCount === beforeCount - 1 ? 'ok' : 'BŁĄD!'
  })`,
)
const gone = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction('pdfs', 'readonly')
  return await new Promise((res) => {
    const r = tx.objectStore('pdfs').count()
    r.onsuccess = () => res(r.result)
  })
})
console.log(`✓ PDF usunięty z bazy: pozostało ${gone} (oczekiwane 0)`)

// ---------- rozdziały w ścieżce ----------
await page.click('button[title*="Nowa ścieżka"]')
await nazwij(page, "Ścieżka z rozdziałami")
await page.waitForSelector('.path-canvas')

await page.click('button:has-text("Rozdział")')
await podaj(page, 'Rozdział I: Podstawy')
await page.waitForSelector('.path-node-heading')
console.log('✓ rozdział dodany na mapie')

// poziom: § → §§ przyciskiem
await page.click('.path-node-heading .heading-level button')
await page.waitForTimeout(400)
const lvl = await page.evaluate(
  () => document.querySelector('.path-node-heading').className,
)
console.log(`✓ zmiana poziomu rozdziału: ${lvl.includes('level-2') ? 'ok (podrozdział)' : 'BŁĄD: ' + lvl}`)
await page.click('.path-node-heading .heading-level button')
await page.click('.path-node-heading .heading-level button') // z powrotem na 1

// w Linii: dodaj podrozdział
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-append')
await page.hover('.linear-append .btn-dolacz:has-text("Rozdział")')
await page.click('.linear-append .dodaj-kafelek-rodzaje .tree-menu-item:has-text("H2")')
await podaj(page, 'Podrozdział 1.1')
await page.waitForTimeout(700)
const inLinear = await page.locator('.linear-content .script-heading-node').count()
console.log(`✓ rozdziały w widoku Linia: ${inLinear} (oczekiwane 2)`)

// w Skrypcie: nagłówki jako h2/h3
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-body')
await page.waitForTimeout(500)
const inScript = await page.evaluate(() =>
  [...document.querySelectorAll('.script-body .script-heading-node')].map(
    (h) => `${h.tagName}:${h.textContent}`,
  ),
)
console.log(`✓ rozdziały w Skrypcie: ${inScript.join(' | ')}`)

// trwałość po przeładowaniu
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(800)
const persisted = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction('paths', 'readonly')
  const all = await new Promise((res) => {
    const r = tx.objectStore('paths').getAll()
    r.onsuccess = () => res(r.result)
  })
  return (all[0]?.nodes ?? [])
    .filter((n) => n.kind === 'heading')
    .map((n) => `${n.text} (poziom ${n.level})`)
})
console.log(`✓ rozdziały zapisane w ścieżce: ${persisted.join(' | ')}`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
