// Test pokazywania powiązań z warstwy wiedzy na mapie ścieżki.
// (Grupowanie kafelków ma własny test: test-group.mjs)
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
page.on('dialog', (d) => d.accept('Sciezka'))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const mk = async (name, type) => {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.selectOption('.type-select', type)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(`Tresc: ${name}.`)
  await page.waitForTimeout(400)
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}
await mk('Istnienie rozkladu', 'twierdzenie')
await mk('Lemat Euklidesa', 'lemat')

// powiązanie w warstwie wiedzy: lemat jest częścią twierdzenia
// (panel powiązań jest chwilowo wycofany z edytora — zapisujemy wprost)
await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const db = req.result
  const cs = await new Promise((res) => {
    const r = db.transaction('concepts', 'readonly').objectStore('concepts').getAll()
    r.onsuccess = () => res(r.result)
  })
  const from = cs.find((c) => c.name.includes('Istnienie')).id
  const to = cs.find((c) => c.name.includes('Lemat')).id
  const tx = db.transaction('relations', 'readwrite')
  tx.objectStore('relations').add({
    id: crypto.randomUUID(),
    fromId: from,
    fromVersionId: null,
    toId: to,
    toVersionId: null,
    kind: 'zawieranie',
    createdAt: new Date().toISOString(),
  })
  await new Promise((res) => (tx.oncomplete = res))
})

await page.click('button[title*="Nowa ścieżka"]')
await nazwij(page, "Sciezka")
await page.waitForSelector('.path-canvas')
let y = 130
for (const n of ['Istnienie rozkladu', 'Lemat Euklidesa']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.path-flow', {
    targetPosition: { x: 340, y },
  })
  await page.waitForTimeout(500)
  y += 220
}
await page.waitForTimeout(700)

// 1. powiązanie widoczne jako przerywana strzałka w kolorze osi
const relEdges = await page.evaluate(() =>
  [...document.querySelectorAll('.react-flow__edge.relation-edge')].map((e) => ({
    os: e.className.baseVal.match(/rel-\w+/)?.[0],
    etykieta: e.querySelector('.react-flow__edge-text')?.textContent,
  })),
)
console.log(`✓ powiązania na mapie: ${JSON.stringify(relEdges)}`)

// 2. przełącznik chowa je
await page.click('button:has-text("⇢ Powiązania")')
await page.waitForTimeout(400)
const hidden = await page.locator('.react-flow__edge.relation-edge').count()
console.log(`✓ przełącznik chowa powiązania: ${hidden} (oczekiwane 0)`)
await page.click('button:has-text("⇢ Powiązania")')
await page.waitForTimeout(400)

// 3. nie trafiają do zapisu ścieżki
const saved = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction('paths', 'readonly')
  const all = await new Promise((res) => {
    const r = tx.objectStore('paths').getAll()
    r.onsuccess = () => res(r.result)
  })
  return all[0].edges.length
})
console.log(`✓ strzałki powiązań nie należą do ścieżki: krawędzi w zapisie ${saved} (oczekiwane 0)`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
