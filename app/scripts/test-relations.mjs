// Test powiązań między klockami na trzech osiach: zawieranie (mereologia),
// skala (taksonomia i wnioskowanie), perspektywa (epistemologia).
// Sprawdza też zawężanie relacji do konkretnej wersji — jedna perspektywa
// klocka bywa uogólnieniem, a inna nie.
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const dialogAnswers = ['ujecie mocniejsze', 'n = 1']
page.on('dialog', (d) => d.accept(dialogAnswers.shift() ?? ''))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const mkBlock = async (name) => {
  await page.click('text=+ Nowy klocek')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.waitForTimeout(400)
  await page.click('.btn-close[title*="Zamknij klocek"]')
}
for (const n of ['Jezyk 1 rzedu', 'Sygnatura', 'Jezyk wg Ksiazki B']) await mkBlock(n)

await page.click('text=+ Nowy klocek')
await page.waitForSelector('.editor-name')
await page.fill('.editor-name', 'Jezyk n-tego rzedu')
await page.waitForTimeout(400)
await page.waitForSelector('.relations')

const addRel = async (button, target) => {
  await page.click(`.relations-add-btn:has-text("${button}")`)
  await page.waitForSelector('.picker-modal')
  await page.fill('.picker-search', target)
  await page.waitForTimeout(300)
  await page.click(`.picker-item:has-text("${target}")`)
  await page.waitForTimeout(500)
}

// oś skali: język 1 rzędu jest MOCNIEJSZY (uszczegółowieniem) od n-tego rzędu
await addRel('mocniejsze', 'Jezyk 1 rzedu')
// oś mereologii: sygnatura jest częścią języka
await addRel('część tego', 'Sygnatura')
// oś epistemologii: ujęcie z innej książki to inna perspektywa
await addRel('inna perspektywa', 'Jezyk wg Ksiazki B')

// 1. trzy osie w mini-mapie, każda z właściwą etykietą
const map = await page.evaluate(() => ({
  centrum: document.querySelector('.minimap-center')?.textContent?.trim(),
  grupy: [...document.querySelectorAll('.minimap-group')].map((g) => ({
    os: g.className.match(/rel-\w+/)[0],
    etykieta: g.querySelector('.minimap-group-label').textContent,
    elementy: [...g.querySelectorAll('.minimap-open')].map((b) => b.textContent.trim()),
  })),
}))
console.log(`✓ mini-mapa, centrum: „${map.centrum}"`)
for (const g of map.grupy) {
  console.log(`   [${g.os}] ${g.etykieta}: ${g.elementy.join(', ')}`)
}

// 2. zapis w bazie — kierunki i rodzaje
const stored = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction(['relations', 'concepts'], 'readonly')
  const rs = await new Promise((res) => {
    const r = tx.objectStore('relations').getAll()
    r.onsuccess = () => res(r.result)
  })
  const cs = await new Promise((res) => {
    const r = tx.objectStore('concepts').getAll()
    r.onsuccess = () => res(r.result)
  })
  const nm = (id) => cs.find((c) => c.id === id)?.name
  return rs.map((r) => `${nm(r.fromId)} --${r.kind}--> ${nm(r.toId)}`)
})
console.log(`✓ relacje w bazie:\n   ${stored.join('\n   ')}`)

// 3. relacja symetryczna nie ma przycisku odwracania
const flipButtons = await page.evaluate(() => {
  const persp = document.querySelector('.minimap-group.rel-perspektywa')
  const skala = document.querySelector('.minimap-group.rel-skala')
  return {
    perspektywa: persp.querySelectorAll('.folder-action[title*="Odwróć"]').length,
    skala: skala.querySelectorAll('.folder-action[title*="Odwróć"]').length,
  }
})
console.log(
  `✓ odwracanie tylko dla relacji skierowanych: perspektywa ${flipButtons.perspektywa} (oczekiwane 0), skala ${flipButtons.skala} (oczekiwane 1)`,
)

// 4. zawężenie relacji do wersji: druga wersja klocka to inne ujęcie
const scopeBefore = await page.locator('.minimap-scope').count()
await page.click('.version-pill.new') // tworzy wersję „ujecie mocniejsze"
await page.waitForTimeout(800)
const scopeAfter = await page.locator('.minimap-scope').count()
console.log(
  `✓ wybór zakresu pojawia się przy wielu wersjach: przed ${scopeBefore}, po ${scopeAfter} (oczekiwane 3)`,
)

// zawęź relację „skala" do wersji drugiej
const opts = await page.evaluate(() =>
  [...document.querySelectorAll('.minimap-group.rel-skala .minimap-scope option')].map(
    (o) => o.textContent,
  ),
)
console.log(`✓ opcje zakresu: ${opts.join(' | ')}`)
await page.selectOption('.minimap-group.rel-skala .minimap-scope', { index: 2 })
await page.waitForTimeout(600)
const scoped = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction(['relations', 'versions'], 'readonly')
  const rs = await new Promise((res) => {
    const r = tx.objectStore('relations').getAll()
    r.onsuccess = () => res(r.result)
  })
  const vs = await new Promise((res) => {
    const r = tx.objectStore('versions').getAll()
    r.onsuccess = () => res(r.result)
  })
  const rel = rs.find((r) => r.kind === 'skala')
  const v = vs.find((x) => x.id === (rel.toVersionId ?? rel.fromVersionId))
  return { toVersionId: rel.toVersionId, etykieta: v?.label ?? (v ? `wr.${v.version}` : null) }
})
console.log(
  `✓ relacja zawężona do wersji: ${scoped.etykieta ? `„${scoped.etykieta}" ok` : 'BRAK ZAWĘŻENIA!'}`,
)

// 5. dopisek (wartość parametru)
await page.hover('.minimap-group.rel-skala .minimap-item')
await page.click('.minimap-group.rel-skala .folder-action[title*="Dopisek"]')
await page.waitForTimeout(600)
const note = await page.evaluate(
  () => document.querySelector('.minimap-note')?.textContent ?? '(brak)',
)
console.log(`✓ dopisek do relacji: „${note}" (oczekiwane „n = 1")`)

// 6. widok z drugiej strony — etykieta odwrotna
await page.click('.minimap-group.rel-skala .minimap-open')
await page.waitForTimeout(800)
const fromOther = await page.evaluate(() => ({
  nazwa: document.querySelector('.editor-name')?.value,
  etykieta: document.querySelector('.minimap-group-label')?.textContent,
}))
// „Jezyk 1 rzedu" jest uszczegółowieniem, więc od jego strony: „mocniejsze niż"
console.log(
  `✓ z perspektywy „${fromOther.nazwa}" etykieta brzmi: „${fromOther.etykieta}" (${
    fromOther.etykieta === 'mocniejsze niż' ? 'ok' : 'NIEZGODNA!'
  })`,
)

// 7. usunięcie powiązania nie rusza klocków
await page.hover('.minimap-item')
await page.click('.minimap-item .folder-action[title*="Usuń powiązanie"]')
await page.waitForTimeout(600)
const after = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const tx = req.result.transaction(['relations', 'concepts'], 'readonly')
  const rs = await new Promise((res) => {
    const r = tx.objectStore('relations').count()
    r.onsuccess = () => res(r.result)
  })
  const cs = await new Promise((res) => {
    const r = tx.objectStore('concepts').count()
    r.onsuccess = () => res(r.result)
  })
  return { relacje: rs, klocki: cs }
})
console.log(
  `✓ po usunięciu powiązania: relacji ${after.relacje} (było 3), klocków ${after.klocki} (bez zmian: ${after.klocki === 4})`,
)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
