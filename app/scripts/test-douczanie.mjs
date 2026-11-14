// „Doucz nowe": kafelek i zadanie dołożone do nauczonego sektora są nowe
// (znaczki, lista Powtórek), douczanie = mapowanie samych nowych → przerwa →
// test tylko z nich; termin sektora zostaje, nowe dostają własną pamięć.
// Nowe zadanie powtarzane osobno wygląda jak zadanie.
import { chromium } from 'playwright'

const problems = []
const errors = []
const check = (nazwa, ok, szczegol = '') => {
  console.log(`${ok ? '✓' : '✗ BŁĄD:'} ${nazwa}${szczegol ? ` — ${szczegol}` : ''}`)
  if (!ok) problems.push(nazwa)
}

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
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

const termin = new Date(Date.now() + 10 * 86400000).toISOString()
await page.evaluate(async (termin) => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const T = db.transaction(['concepts', 'versions', 'paths', 'nauka', 'subpages', 'pamiec', 'historia'], 'readwrite')
  const now = new Date().toISOString()
  const nodes = []
  const kaf = (id, nazwa, typ = 'definicja', pathId) => {
    T.objectStore('concepts').put({ id, name: nazwa, type: typ, ...(pathId ? { pathId } : {}), currentVersionId: 'v' + id, folderId: null, tags: [], createdAt: now, updatedAt: now, order: 1 })
    T.objectStore('versions').put({ id: 'v' + id, conceptId: id, version: 1, content: 'Treść: ' + nazwa, sourceRefs: [], createdAt: now, updatedAt: now })
  }
  for (const [id, n] of [['c1', 'Kula'], ['c2', 'Otoczenie'], ['c3', 'Zbiór domknięty']]) {
    kaf(id, n, 'definicja', 'p')
    nodes.push({ id: 'n' + id, kind: 'block', conceptId: id, versionId: null, subpageId: null, x: 0, y: nodes.length * 100 })
  }
  for (const [id, n] of [['z0', 'Stare zadanie'], ['z1', 'Nowe zadanie'], ['z2', 'Jeszcze nowsze']]) {
    kaf(id, n, 'zadanie', 'p')
    T.objectStore('subpages').put({ id: 's' + id, conceptId: id, versionId: 'v' + id, name: 'Rozwiązanie', content: 'Rozwiązanie ' + n, order: 1, createdAt: now, updatedAt: now })
  }
  const edges = nodes.slice(1).map((n, i) => ({ id: 'e' + i, from: nodes[i].id, to: n.id }))
  T.objectStore('paths').put({ id: 'p', name: 'Topologia', folderId: null, order: 0, nodes, edges, createdAt: now, updatedAt: now })
  const karta = { due: termin, stability: 10, difficulty: 5, scheduled_days: 10, reps: 2, lapses: 0, learning_steps: 0, state: 2, last_review: now }
  // nauczony sektor: c1, c2 i stare zadanie z0 były w teście; c3 i z1 dołożone później
  T.objectStore('nauka').put({ id: 's1', rodzaj: 'sektor', pathId: 'p', nazwa: 'Kule', wezly: ['nc1', 'nc2', 'nc3'], kolor: '#5b8def', etap: 'powtorki', karta, termin, powtorek: 1, ostatniaRozszerzona: 0, zadania: ['z0', 'z1'], utworzono: now, zmieniono: now })
  for (const k of ['c1', 'c2']) T.objectStore('pamiec').put({ klucz: k, karta, slaby: false, termin, wpadki: 0, jednostkaId: 's1', pathId: 'p', zmieniono: now })
  T.objectStore('historia').put({ id: 'h1', kiedy: now, jednostkaId: 's1', typ: 'koncowy', ocena: 3, kafelki: { c1: 'tak', c2: 'tak', 'zadanie:z0': 'tak' } })
  await new Promise((r) => (T.oncomplete = r))
}, termin)
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(700)

// --- Powtórki: nowe osobno ---
await page.click('.sidebar-powtorki')
await page.waitForSelector('.powtorki')
const naDzis = await page.locator('.powtorki-tresc').innerText()
check('Powtórki: nowy kafelek i nowe zadanie na dziś', naDzis.includes('Zbiór domknięty') && naDzis.includes('Nowe zadanie'))
check('Powtórki: zadanie sprawdzone w teście nie jest nowe', !naDzis.includes('Stare zadanie'))
await page.click('.powtorki .btn:has-text("Wróć")')

// --- widok Nauka: znaczki ---
await page.click('.path-item:has-text("Topologia")')
await page.click('.view-switch button:has-text("Nauka")')
await page.waitForSelector('.widok-sektorow .ws-lista')
check('Sektory: nagłówek sektora mówi „nowe: 2"', (await page.locator('.ws-sektor').innerText()).includes('nowe: 2'))
check('Sektory: znaczek „nowy" na nowym kafelku i zadaniu', (await page.locator('.ws-wiersz[data-seg="nc3"] .ws-nowy').count()) === 1 &&
  (await page.locator('.ws-wiersz[data-zadanie="z1"] .ws-nowy').count()) === 1 && (await page.locator('.ws-wiersz[data-zadanie="z0"] .ws-nowy').count()) === 0)
check('Panel: „Doucz nowe (2)"', (await page.locator('.karta-sektora-nowe button:has-text("Doucz nowe (2)")').count()) === 1)

// --- douczanie ---
await page.click('.karta-sektora-nowe button:has-text("Doucz nowe")')
await page.waitForSelector('.mapa-douczanie')
const lista = await page.locator('.mapa-douczanie').innerText()
check('Mapa: lista nowych do dopisania', lista.includes('Zbiór domknięty') && lista.includes('zadanie: Nowe zadanie'))
await page.click('.panel-nauki-zakladki button:has-text("Sektory")')
await page.click('.karta-douczanie button:has-text("Skończyłem")')
await page.waitForSelector('.karta-douczanie button:has-text("Test nowych")')
await page.click('.karta-douczanie button:has-text("Test nowych")')
await page.waitForSelector('.sesja-element')
check('Sesja douczania: tylko nowe, bez mapy', (await page.locator('.sesja-rodzaj').textContent()) === 'Douczanie nowych' &&
  (await page.locator('.sesja-element').count()) === 2 && (await page.locator('.sesja-element-zadanie').count()) === 1 &&
  (await page.locator('.sesja-mapa-pamiec').count()) === 0)
for (let i = 0; i < 2; i++) {
  await page.locator('.sesja-element').nth(i).locator('button:has-text("Sprawdź")').click()
  await page.locator('.sesja-element').nth(i).locator('button:has-text("Tak")').click()
}
await page.click('.sesja-zapisz')
await page.waitForSelector('.sesja-wynik')
check('po douczaniu: komunikat', (await page.locator('.sesja-wynik').innerText()).includes('Nowe zapisane'))
let d = await baza()
const s1 = d.nauka.find((j) => j.id === 's1')
check('termin sektora bez zmian, douczanie zamknięte', s1.termin === termin && !s1.douczanie)
const pc3 = d.pamiec.find((p) => p.klucz === 'c3')
const pz1 = d.pamiec.find((p) => p.klucz === 'zadanie:z1')
check('nowe dostały pamięć i gonią sektor (słabe, wcześniej niż sektor)', !!pc3 && !!pz1 && pc3.slaby && pz1.slaby &&
  pc3.termin < termin && pz1.jednostkaId === 's1')
check('historia: wpis douczania', d.historia.some((h) => h.typ === 'douczanie' && h.kafelki?.c3 === 'tak'))
await page.click('.sesja-wynik button:has-text("Gotowe")')
await page.waitForSelector('.karta-sektora')
check('po douczaniu nie ma już „Doucz nowe"', (await page.locator('.karta-sektora-nowe').count()) === 0)

// --- nowe zadanie osobno: wygląda jak zadanie ---
await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const t = db.transaction('nauka', 'readwrite')
  const st = t.objectStore('nauka')
  const g = st.get('s1')
  await new Promise((r) => (g.onsuccess = r))
  st.put({ ...g.result, zadania: [...g.result.zadania, 'z2'] })
  await new Promise((r) => (t.oncomplete = r))
  db.close()
})
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(700)
await page.click('.sidebar-powtorki')
await page.click('.powtorki-pozycja:has-text("Jeszcze nowsze") button:has-text("Zacznij")')
await page.waitForSelector('.sesja-element')
check('nowe zadanie osobno: treść widać, rozwiązanie zakryte', (await page.locator('.sesja-element-zadanie').count()) === 1 &&
  (await page.locator('.sesja-element-zadanie').innerText()).includes('Treść: Jeszcze nowsze') &&
  !(await page.locator('.sesja-element-zadanie').innerText()).includes('Rozwiązanie Jeszcze'))
await page.click('.sesja-element button:has-text("Sprawdź")')
check('po odsłonięciu widać rozwiązanie', (await page.locator('.sesja-rozwiazanie').innerText()).includes('Rozwiązanie Jeszcze nowsze'))
await page.click('.sesja-element button:has-text("Tak")')
await page.click('.sesja-zapisz')
await page.waitForSelector('.sesja-wynik')
d = await baza()
check('nowe zadanie ma pamięć przy swoim sektorze', d.pamiec.some((p) => p.klucz === 'zadanie:z2' && p.jednostkaId === 's1'))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(problems.length === 0 ? '>>> WSZYSTKO POPRAWNE' : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`)
await browser.close()
if (problems.length || errors.length) process.exit(1)
