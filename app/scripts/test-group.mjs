// Test grupowania kafelków w ścieżce: kilka kafelków pod jedną nazwą, ale nadal
// jako osobne pełne kafelki (własny wybór wersji), w jednej ramce.
import { chromium } from 'playwright'
import { nazwij, podaj, zloz } from './lib.mjs'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const answers = ['wg Ksiazki B', 'Poczatki teorii mnogosci']
page.on('dialog', (d) => d.accept(answers.shift() ?? 'X'))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const mk = async (name, content, twoVersions = false) => {
  await page.click('.sidebar-create-btn[title="Nowy kafelek"]')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(content)
  await page.waitForTimeout(400)
  if (twoVersions) {
    await page.click('.version-pill.new')
    await podaj(page, 'wg Ksiazki B')
    await page.waitForTimeout(500)
  }
  await page.click('.btn-close[title*="Zamknij kafelek"]')
}
await mk('Zbior', 'Kolekcja obiektow traktowana jako calosc.', true)
await mk('Element', 'Obiekt nalezacy do zbioru.')

await page.click('button[title*="Nowa ścieżka"]')
await nazwij(page, "Sciezka")
await page.waitForSelector('.path-canvas')
let y = 130
for (const n of ['Zbior', 'Element']) {
  await page.dragAndDrop(`.concept-item:has-text("${n}")`, '.path-flow', {
    targetPosition: { x: 340, y },
  })
  await page.waitForTimeout(500)
  y += 200
}

// scal oba kafelki w grupę
await page.click('.react-flow__node:has-text("Zbior")')
await page.keyboard.down('Control')
await page.click('.react-flow__node:has-text("Element")')
await page.keyboard.up('Control')
await page.click('button:has-text("⧉ Scal")')
await zloz(page, 'Poczatki teorii mnogosci')
await page.waitForSelector('.path-node-group')
await page.waitForTimeout(600)

// 1. na mapie: jeden pseudo-kafelek z nazwą i pełnymi kafelkami w środku
const onMap = await page.evaluate(() => {
  const g = document.querySelector('.path-node-group')
  return {
    nazwa: g.querySelector('.group-name')?.textContent,
    czlonkowie: [...g.querySelectorAll('.group-member')].map((m) => ({
      nazwa: m.querySelector('.group-member-name')?.textContent,
      maWyborWersji: !!m.querySelector('.group-member-version'),
      tresc: m.querySelector('.path-node-body')?.textContent?.trim().slice(0, 40),
    })),
  }
})
console.log(`✓ grupa na mapie: „${onMap.nazwa}"`)
for (const c of onMap.czlonkowie) {
  console.log(`   • ${c.nazwa} (wybór wersji: ${c.maWyborWersji}) — „${c.tresc}"`)
}

// 2. wybór wersji członka działa niezależnie (członkowie idą w kolejności
// od góry mapy, więc szukamy po nazwie, a nie po pozycji na liście)
// dopasowanie po samej nazwie kafelka — treść drugiego zawiera słowo „zbioru"
const zbiorMember = page.locator('.group-member:has(.group-member-name:text-is("Zbior"))')
const opts = await zbiorMember.locator('option').allTextContents()
console.log(`✓ wersje członka „Zbior": ${opts.join(' | ')}`)
await zbiorMember.locator('.group-member-version').selectOption({ index: 2 })
await page.waitForTimeout(900)
const savedVer = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction(['paths', 'versions'], 'readonly')
  const ps = await new Promise((res) => {
    const r = tx.objectStore('paths').getAll()
    r.onsuccess = () => res(r.result)
  })
  const vs = await new Promise((res) => {
    const r = tx.objectStore('versions').getAll()
    r.onsuccess = () => res(r.result)
  })
  const g = ps[0].nodes.find((n) => n.kind === 'fusion')
  const withVersion = g.parts.find((p) => p.versionId)
  const v = vs.find((x) => x.id === withVersion?.versionId)
  return { liczbaCzesci: g.parts.length, wersja: v?.label ?? null }
})
console.log(
  `✓ wybór wersji zapisany w ścieżce: „${savedVer.wersja}", części w grupie: ${savedVer.liczbaCzesci}`,
)

// 3. grupa jako blok danego typu (jak DEFINICJA), a w środku sam tekst
await page.click('.view-switch button:has-text("Mapa")')
await page.waitForSelector('.path-node-group')
await page.selectOption('.path-node-group .fusion-type', 'definicja')
await page.waitForTimeout(500)
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-group-block')
await page.waitForTimeout(600)
const inScript = await page.evaluate(() => {
  const g = document.querySelector('.script-group-block')
  return {
    naglowek: g.querySelector('.script-block-title')?.textContent?.trim(),
    typBloku: g.className.includes('script-definicja'),
    czesci: [...g.querySelectorAll('.group-part')].map((p) => ({
      wersja: p.querySelector('.block-pick')?.textContent?.trim(),
      tresc: p.querySelector('.markdown-body')?.textContent?.trim(),
    })),
    // wewnątrz nie ma już osobnych bloków ani ich tytułów
    zagniezdzoneBloki: g.querySelectorAll('.script-block').length,
    zrodlaRazem: g.querySelectorAll('.source-list').length,
  }
})
console.log(`✓ grupa jako blok: „${inScript.naglowek}" (barwiona jak definicja: ${inScript.typBloku})`)
for (const c of inScript.czesci) console.log(`   • [${c.wersja}] „${c.tresc}"`)
console.log(
  `✓ kafelki w środku bez własnych ramek i tytułów: zagnieżdżonych bloków ${inScript.zagniezdzoneBloki} (oczekiwane 0)`,
)
console.log(
  `✓ jedna wspólna stopka źródeł: ${inScript.zrodlaRazem} (oczekiwane 0 przy braku źródeł)`,
)

// 4. kafelki w bazie pozostają osobne
const base = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction('concepts', 'readonly')
  return await new Promise((res) => {
    const r = tx.objectStore('concepts').getAll()
    r.onsuccess = () => res(r.result.map((c) => c.name))
  })
})
console.log(`✓ w bazie nadal osobne kafelki: ${base.join(', ')}`)

// 5. rozgrupowanie przywraca osobne kafelki
await page.click('.view-switch button:has-text("Mapa")')
await page.waitForSelector('.path-node-group')
await page.waitForTimeout(400)
await page.click('.path-node-group button[title*="Rozgrupuj"]')
await page.waitForTimeout(700)
const afterUngroup = await page.evaluate(() => ({
  grupy: document.querySelectorAll('.path-node-group').length,
  kafelki: document.querySelectorAll('.react-flow__node-block').length,
}))
console.log(
  `✓ rozgrupowanie: grup ${afterUngroup.grupy} (oczekiwane 0), osobnych kafelków ${afterUngroup.kafelki} (oczekiwane 2)`,
)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
