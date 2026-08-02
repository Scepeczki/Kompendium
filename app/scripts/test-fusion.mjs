// Test scalania klocków w ścieżce (fuzja z typem, nazwą i zarządzaniem
// częściami) oraz pokazywania powiązań z warstwy wiedzy na mapie.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const answers = ['Sciezka', 'Twierdzenie o rozkladzie', 'Twierdzenie glowne']
page.on('dialog', (d) => d.accept(answers.shift() ?? 'X'))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const mk = async (name, type) => {
  await page.click('text=+ Nowy klocek')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.selectOption('.type-select', type)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(`Tresc: ${name}.`)
  await page.waitForTimeout(400)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}
await mk('Istnienie rozkladu', 'twierdzenie')
await mk('Jednoznacznosc rozkladu', 'twierdzenie')
await mk('Lemat Euklidesa', 'lemat')

// powiązanie w warstwie wiedzy: lemat jest częścią twierdzenia o istnieniu
await page.click('.concept-item:has-text("Istnienie rozkladu")')
await page.waitForSelector('.relations')
await page.click('.relations-add-btn:has-text("część tego")')
await page.waitForSelector('.picker-modal')
await page.fill('.picker-search', 'Lemat')
await page.waitForTimeout(300)
await page.click('.picker-item:has-text("Lemat Euklidesa")')
await page.waitForTimeout(500)
await page.click('.btn-close[title*="Zamknij klocek"]')

// ścieżka z trzema kafelkami
await page.click('button[title*="Nowa ścieżka"]')
await page.waitForSelector('.path-canvas')
let y = 120
for (const n of ['Istnienie rozkladu', 'Jednoznacznosc rozkladu', 'Lemat Euklidesa']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.path-flow', {
    targetPosition: { x: 320, y },
  })
  await page.waitForTimeout(400)
  y += 170
}

// 1. powiązania widoczne na mapie jako przerywane strzałki
await page.waitForTimeout(600)
const relEdges = await page.evaluate(() => {
  const es = [...document.querySelectorAll('.react-flow__edge.relation-edge')]
  return es.map((e) => ({
    os: e.className.baseVal.match(/rel-\w+/)?.[0],
    etykieta: e.querySelector('.react-flow__edge-text')?.textContent,
  }))
})
console.log(`✓ powiązania na mapie: ${JSON.stringify(relEdges)}`)

// przełącznik chowa je i nie rusza strzałek ścieżki
await page.click('button:has-text("⇢ Powiązania")')
await page.waitForTimeout(400)
const hidden = await page.locator('.react-flow__edge.relation-edge').count()
console.log(`✓ przełącznik chowa powiązania: ${hidden} (oczekiwane 0)`)
await page.click('button:has-text("⇢ Powiązania")')
await page.waitForTimeout(400)

// 2. scalenie dwóch twierdzeń w jedno
await page.click('.path-node:has-text("Istnienie rozkladu")')
await page.keyboard.down('Control')
await page.click('.path-node:has-text("Jednoznacznosc rozkladu")')
await page.keyboard.up('Control')
await page.click('button:has-text("⧉ Scal")')
await page.waitForSelector('.path-node-fusion')
const fusion = await page.evaluate(() => {
  const f = document.querySelector('.path-node-fusion')
  return {
    nazwa: f.querySelector('.path-node-name')?.textContent,
    typ: f.querySelector('.fusion-type')?.value,
    czesci: [...f.querySelectorAll('.fusion-part-name')].map((s) => s.textContent),
    typowany: f.className.includes('fusion-typed'),
  }
})
console.log(
  `✓ scalony blok: „${fusion.nazwa}", typ „${fusion.typ}" (przejęty z części: ${fusion.typowany}), części: ${fusion.czesci.join(' + ')}`,
)

// 3. dołożenie trzeciej części przyciskiem +
await page.click('.path-node-fusion button[title*="Dodaj klocek"]')
await page.waitForSelector('.picker-modal')
await page.fill('.picker-search', 'Lemat')
await page.waitForTimeout(300)
await page.click('.picker-item:has-text("Lemat Euklidesa")')
await page.waitForTimeout(600)
const parts3 = await page.locator('.path-node-fusion .fusion-part-name').count()
console.log(`✓ dołożenie klocka do bloku: części ${parts3} (oczekiwane 3)`)

// 4. wyjęcie części
await page.hover('.path-node-fusion .fusion-parts li:last-child')
await page.click('.path-node-fusion .fusion-parts li:last-child .folder-action')
await page.waitForTimeout(500)
const parts2 = await page.locator('.path-node-fusion .fusion-part-name').count()
console.log(`✓ wyjęcie klocka z bloku: części ${parts2} (oczekiwane 2)`)

// 5. zmiana typu scalonej całości i nazwy
await page.selectOption('.path-node-fusion .fusion-type', 'lemat')
await page.waitForTimeout(400)
await page.dblclick('.path-node-fusion .path-node-name')
await page.waitForTimeout(600)
const renamed = await page.evaluate(() => {
  const f = document.querySelector('.path-node-fusion')
  return { nazwa: f.querySelector('.path-node-name')?.textContent, typ: f.querySelector('.fusion-type')?.value }
})
console.log(`✓ zmiana nazwy i typu: „${renamed.nazwa}" / ${renamed.typ}`)

// 6. w Skrypcie scalony blok wygląda jak jeden blok danego typu
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-block')
await page.waitForTimeout(500)
const inScript = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.script-block')].find((x) =>
    x.className.includes('script-fusion') || x.textContent.includes('Twierdzenie glowne'),
  )
  return {
    klasa: b?.className,
    naglowek: b?.querySelector('.script-block-title')?.textContent?.trim(),
    czesci: [...(b?.querySelectorAll('.script-fusion-part-title') ?? [])].map((h) =>
      h.textContent.trim(),
    ),
  }
})
console.log(`✓ w Skrypcie: „${inScript.naglowek}"`)
console.log(`   części: ${inScript.czesci.join(' | ')}`)

// 7. zapis w ścieżce (typ trafia do bazy)
const saved = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction('paths', 'readonly')
  const all = await new Promise((res) => {
    const r = tx.objectStore('paths').getAll()
    r.onsuccess = () => res(r.result)
  })
  const f = all[0].nodes.find((n) => n.kind === 'fusion')
  return { nazwa: f.name, typ: f.type, liczbaCzesci: f.parts.length }
})
console.log(`✓ zapis w bazie: ${JSON.stringify(saved)}`)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
