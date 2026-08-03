// Test grupowania klocków w ścieżce: kilka klocków pod jedną nazwą, ale nadal
// jako osobne pełne klocki (własny wybór wersji), w jednej ramce.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const answers = ['wg Ksiazki B', 'Sciezka', 'Poczatki teorii mnogosci']
page.on('dialog', (d) => d.accept(answers.shift() ?? 'X'))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const mk = async (name, content, twoVersions = false) => {
  await page.click('text=+ Nowy klocek')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.click('.view-switch button:has-text("Kod")')
  await page.click('.editor-code .cm-content')
  await page.keyboard.type(content)
  await page.waitForTimeout(400)
  if (twoVersions) {
    await page.click('.version-pill.new')
    await page.waitForTimeout(700)
  }
  await page.click('.btn-close[title*="Zamknij klocek"]')
}
await mk('Zbior', 'Kolekcja obiektow traktowana jako calosc.', true)
await mk('Element', 'Obiekt nalezacy do zbioru.')

await page.click('button[title*="Nowa ścieżka"]')
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
await page.waitForSelector('.path-node-group')
await page.waitForTimeout(600)

// 1. na mapie: jeden pseudo-kafelek z nazwą i pełnymi klockami w środku
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

// 2. wybór wersji członka działa niezależnie
const opts = await page.evaluate(() =>
  [...document.querySelectorAll('.group-member')[0].querySelectorAll('option')].map(
    (o) => o.textContent,
  ),
)
console.log(`✓ wersje pierwszego członka: ${opts.join(' | ')}`)
await page.selectOption('.group-member:first-child .group-member-version', { index: 2 })
await page.waitForTimeout(600)
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
  const v = vs.find((x) => x.id === g.parts[0].versionId)
  return { liczbaCzesci: g.parts.length, wersja: v?.label ?? null }
})
console.log(
  `✓ wybór wersji zapisany w ścieżce: część 1 → „${savedVer.wersja}", części w grupie: ${savedVer.liczbaCzesci}`,
)

// 3. w Skrypcie: ramka z nazwą, w środku PEŁNE bloki (nagłówek typu + wersja)
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForSelector('.script-group')
await page.waitForTimeout(600)
const inScript = await page.evaluate(() => {
  const g = document.querySelector('.script-group')
  return {
    nazwa: g.querySelector('.script-group-name')?.textContent,
    bloki: [...g.querySelectorAll('.script-block')].map((b) => ({
      naglowek: b.querySelector('.script-block-title')?.textContent?.trim(),
      wersja: b.querySelector('.block-pick')?.textContent?.trim(),
      tresc: b.querySelector('.block-content .markdown-body')?.textContent?.trim(),
    })),
  }
})
console.log(`✓ w Skrypcie ramka: „${inScript.nazwa}"`)
for (const b of inScript.bloki) {
  console.log(`   • ${b.naglowek} [${b.wersja}] — „${b.tresc}"`)
}
console.log(
  `✓ członkowie to pełne bloki (nie podpunkty): ${
    inScript.bloki.length === 2 && inScript.bloki.every((b) => b.naglowek && b.wersja)
      ? 'ok'
      : 'BŁĄD'
  }`,
)

// 4. klocki w bazie pozostają osobne
const base = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction('concepts', 'readonly')
  return await new Promise((res) => {
    const r = tx.objectStore('concepts').getAll()
    r.onsuccess = () => res(r.result.map((c) => c.name))
  })
})
console.log(`✓ w bazie nadal osobne klocki: ${base.join(', ')}`)

// 5. rozgrupowanie przywraca osobne kafelki
await page.click('.view-switch button:has-text("Mapa")')
await page.waitForSelector('.path-node-group')
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
