// Zmieniona treść kafelka w nauczonym sektorze: lista zmienionych na karcie,
// „Treść bez zmian" zdejmuje kafelek z listy, „Doucz zmienione" uczy tylko je
// od zera (jak nowe), termin sektora zostaje.
import { chromium } from 'playwright'

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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')
// bez czekania 20 minut na przerwę
await page.evaluate(() => localStorage.setItem('ui.nauka.przerwa', '0'))

const baza = () =>
  page.evaluate(async () => {
    const req = indexedDB.open('kompendium')
    await new Promise((r) => (req.onsuccess = r))
    const db = req.result
    const wez = (t) => new Promise((r) => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess = () => r(q.result) })
    const [nauka, pamiec, historia] = [await wez('nauka'), await wez('pamiec'), await wez('historia')]
    db.close()
    return { nauka, pamiec, historia }
  })

const D = 86400000
const termin = new Date(Date.now() + 10 * D).toISOString()
await page.evaluate(async ({ termin, D }) => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const T = db.transaction(['concepts', 'versions', 'paths', 'nauka', 'pamiec', 'historia'], 'readwrite')
  const now = new Date().toISOString()
  const wczoraj = new Date(Date.now() - D).toISOString()
  const dawno = new Date(Date.now() - 3 * D).toISOString()
  const nodes = []
  // c1 i c2 zmienione po teście, c3 nie
  for (const [id, n, zm] of [['c1', 'Kula', now], ['c2', 'Otoczenie', now], ['c3', 'Zbiór domknięty', dawno]]) {
    T.objectStore('concepts').put({ id, name: n, type: 'definicja', currentVersionId: 'v' + id, folderId: null, tags: [], createdAt: dawno, updatedAt: zm, order: 1 })
    T.objectStore('versions').put({ id: 'v' + id, conceptId: id, version: 1, content: 'Treść: ' + n, sourceRefs: [], createdAt: dawno, updatedAt: zm })
    nodes.push({ id: 'n' + id, kind: 'block', conceptId: id, versionId: null, subpageId: null, x: 0, y: nodes.length * 100 })
  }
  const edges = nodes.slice(1).map((n, i) => ({ id: 'e' + i, from: nodes[i].id, to: n.id }))
  T.objectStore('paths').put({ id: 'p', name: 'Topologia', folderId: null, order: 0, nodes, edges, createdAt: dawno, updatedAt: dawno })
  const karta = { due: termin, stability: 10, difficulty: 5, scheduled_days: 10, reps: 4, lapses: 0, learning_steps: 0, state: 2, last_review: wczoraj }
  T.objectStore('nauka').put({ id: 's1', rodzaj: 'sektor', pathId: 'p', nazwa: 'Kule', wezly: ['nc1', 'nc2', 'nc3'], kolor: '#5b8def', etap: 'powtorki', karta, termin, powtorek: 3, ostatniaRozszerzona: 0, ostatnia: wczoraj, utworzono: dawno, zmieniono: wczoraj })
  for (const k of ['c1', 'c2', 'c3']) T.objectStore('pamiec').put({ klucz: k, karta, slaby: false, termin, wpadki: 0, jednostkaId: 's1', pathId: 'p', nodeId: 'n' + k, zmieniono: wczoraj })
  T.objectStore('historia').put({ id: 'h1', kiedy: wczoraj, jednostkaId: 's1', typ: 'powtorka', ocena: 3, kafelki: { c1: 'tak', c2: 'tak', c3: 'tak' } })
  await new Promise((r) => (T.oncomplete = r))
}, { termin, D })
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(700)

await page.click('.path-item:has-text("Topologia")')
await page.click('.view-switch button:has-text("Nauka")')
await page.waitForSelector('.karta-sektora-zmienione', { timeout: 8000 }).catch(() => {})
let tekst = await page.locator('.karta-sektora-zmienione').textContent().catch(() => '')
check('karta pokazuje dwa zmienione kafelki (bez niezmienionego)', tekst.includes('Kula') && tekst.includes('Otoczenie') && !tekst.includes('Zbiór') && tekst.includes('Doucz zmienione (2)'), tekst)

// „Treść bez zmian" przy Otoczeniu
await page.click('.karta-sektora-zmienione li:has-text("Otoczenie") button:has-text("Treść bez zmian")')
await page.waitForSelector('.karta-sektora-zmienione li:has-text("Otoczenie")', { state: 'detached' })
tekst = await page.locator('.karta-sektora-zmienione').textContent()
let d = await baza()
check('„Treść bez zmian": kafelek znika z listy, pamięć bez zmian', tekst.includes('Doucz zmienione (1)') && !tekst.includes('Otoczenie') &&
  !!d.pamiec.find((p) => p.klucz === 'c2').trescOk && d.pamiec.find((p) => p.klucz === 'c2').karta.reps === 4)

// douczanie samej Kuli — jak nowego kafelka
await page.click('.karta-sektora-zmienione button:has-text("Doucz zmienione")')
await page.waitForSelector('.tm')
await page.waitForSelector('.tm-lista-poz:has-text("Kula")')
const lista = await page.locator('.tm-lista').innerText()
check('mapowanie douczania: tylko zmieniony kafelek', lista.includes('Kula') && !lista.includes('Otoczenie') && !lista.includes('Zbiór'))
await page.click('.tm-glowa button:has-text("Skończyłem mapowanie")')
await page.waitForSelector('.tm', { state: 'detached' })
await page.waitForSelector('.karta-douczanie button:has-text("Test nowych")')
await page.click('.karta-douczanie button:has-text("Test nowych")')
await page.waitForSelector('.sesja-element')
check('test tylko ze zmienionego', (await page.locator('.sesja-element').count()) === 1)
await page.locator('.sesja-element').nth(0).locator('button:has-text("Sprawdź")').click()
await page.locator('.sesja-element').nth(0).locator('button:has-text("Tak")').click()
await page.click('.sesja-zapisz')
await page.waitForSelector('.sesja-wynik')
d = await baza()
const p1 = d.pamiec.find((p) => p.klucz === 'c1')
const s1 = d.nauka.find((j) => j.id === 's1')
check('Kula: karta od zera (pierwsza powtórka), słaba, goni sektor', p1.karta.reps === 1 && p1.slaby && p1.termin < termin, JSON.stringify({ reps: p1.karta.reps, s: p1.slaby, t: p1.termin }))
check('termin sektora bez zmian, douczanie zamknięte', s1.termin === termin && !s1.douczanie)
check('niezmienione kafelki nietknięte', d.pamiec.find((p) => p.klucz === 'c3').karta.reps === 4)
await page.click('.sesja-wynik button:has-text("Gotowe")')
await page.waitForSelector('.karta-sektora')
await page.waitForTimeout(300)
check('po douczaniu nie ma już listy zmienionych', (await page.locator('.karta-sektora-zmienione').count()) === 0)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(problems.length === 0 ? '>>> WSZYSTKO POPRAWNE' : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`)
await browser.close()
if (problems.length || errors.length) process.exit(1)
