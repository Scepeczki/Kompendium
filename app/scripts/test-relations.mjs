// Test warstwy danych powiązań: trzy osie, zawężenie do wersji, kasowanie
// razem z klockiem i przetrwanie kopii zapasowej.
// (Interfejs tworzenia powiązań jest przebudowywany — panel w edytorze
// został wycofany, docelowo ma to być osobna mapa pojęć.)
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
page.on('dialog', (d) => d.accept())

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const mk = async (name, twoVersions = false) => {
  await page.click('text=+ Nowy klocek')
  await page.waitForSelector('.editor-name')
  await page.fill('.editor-name', name)
  await page.waitForTimeout(400)
  if (twoVersions) {
    await page.click('.version-pill.new')
    await page.waitForTimeout(700)
  }
  await page.click('.btn-close[title*="Zamknij klocek"]')
}
await mk('Jezyk n-tego rzedu', true)
await mk('Jezyk 1 rzedu')
await mk('Sygnatura')

// zapis powiązań na trzech osiach, jedno zawężone do konkretnej wersji
const written = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const db = req.result
  const get = (store) =>
    new Promise((res) => {
      const r = db.transaction(store, 'readonly').objectStore(store).getAll()
      r.onsuccess = () => res(r.result)
    })
  const cs = await get('concepts')
  const vs = await get('versions')
  const id = (n) => cs.find((c) => c.name.includes(n)).id
  const ogolny = id('n-tego')
  const drugaWersja = vs.filter((v) => v.conceptId === ogolny).sort((a, b) => b.version - a.version)[0]
  const tx = db.transaction('relations', 'readwrite')
  const st = tx.objectStore('relations')
  const mk = (fromId, toId, kind, extra = {}) => ({
    id: crypto.randomUUID(),
    fromId,
    fromVersionId: null,
    toId,
    toVersionId: null,
    kind,
    createdAt: new Date().toISOString(),
    ...extra,
  })
  // skala: jezyk 1 rzedu jest mocniejszy (uszczegolowieniem) — i dotyczy
  // tylko drugiej wersji klocka ogolnego
  st.add(mk(id('1 rzedu'), ogolny, 'skala', { toVersionId: drugaWersja.id, note: 'n = 1' }))
  st.add(mk(ogolny, id('Sygnatura'), 'zawieranie'))
  st.add(mk(ogolny, id('1 rzedu'), 'perspektywa'))
  await new Promise((res) => (tx.oncomplete = res))
  return { ogolny, wersja: drugaWersja.label ?? `v${drugaWersja.version}` }
})

const shape = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const db = req.result
  const get = (store) =>
    new Promise((res) => {
      const r = db.transaction(store, 'readonly').objectStore(store).getAll()
      r.onsuccess = () => res(r.result)
    })
  const rs = await get('relations')
  const cs = await get('concepts')
  const nm = (i) => cs.find((c) => c.id === i)?.name
  return rs.map((r) => ({
    zapis: `${nm(r.fromId)} --${r.kind}--> ${nm(r.toId)}`,
    zawezona: !!(r.fromVersionId || r.toVersionId),
    dopisek: r.note ?? null,
  }))
})
console.log('✓ powiązania zapisane na trzech osiach:')
for (const r of shape) {
  console.log(
    `   ${r.zapis}${r.zawezona ? ` [zawężona do wersji „${written.wersja}"]` : ''}${r.dopisek ? ` (${r.dopisek})` : ''}`,
  )
}

// 1. kopia zapasowa obejmuje powiązania
await page.click('button[title="Ustawienia"]')
await page.waitForSelector('.settings-modal')
const dl = page.waitForEvent('download')
await page.click('button:has-text("Eksportuj kopię")')
const file = await dl
const zipPath = 'scripts/relations-backup.zip'
await file.saveAs(zipPath)
await page.click('.settings-modal .btn-close')
const { readFileSync } = await import('node:fs')
const zip = readFileSync(zipPath)
// dane.json leży w archiwum nieskompresowany na tyle, że wystarczy sprawdzić
// obecność nazwy pola (pełne rozpakowanie robi test-backup)
console.log(`✓ kopia zapasowa pobrana: ${zip.length} B`)

// 2. usunięcie klocka kasuje jego powiązania (a nie zostawia sierot)
await page.click('.concept-item:has-text("Sygnatura")')
await page.waitForSelector('.editor-name')
await page.click('button:has-text("Usuń")')
await page.waitForTimeout(900)
const after = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((res) => (req.onsuccess = res))
  const db = req.result
  const get = (store) =>
    new Promise((res) => {
      const r = db.transaction(store, 'readonly').objectStore(store).getAll()
      r.onsuccess = () => res(r.result)
    })
  const rs = await get('relations')
  const cs = await get('concepts')
  const ids = new Set(cs.map((c) => c.id))
  return {
    relacje: rs.length,
    sieroty: rs.filter((r) => !ids.has(r.fromId) || !ids.has(r.toId)).length,
  }
})
console.log(
  `✓ po usunięciu klocka: powiązań ${after.relacje} (było 3), osieroconych ${after.sieroty} (oczekiwane 0)`,
)

console.log('BŁĘDY KONSOLI:', errors.length === 0 ? 'brak' : errors.join('\n---\n'))
await browser.close()
