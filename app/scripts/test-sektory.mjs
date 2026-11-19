// Sektory w widoku Nauka: widok Sektory (oś z kartami), Przegląd (linia z kuleczkami, zaznaczanie
// przeciąganiem i rozdziałem), pasmo przez notatkę w środku sektora, pasek
// zadań tylko na samym końcu sektora, zadanie z paska do Linii i z powrotem,
// usuwanie zadania po pytaniu.
import { chromium } from 'playwright'
import { potwierdz, podaj } from './lib.mjs'

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
// ten test sprawdza Nauki na pełnej Linii (domyślny jest widok Sektory)
await page.evaluate(() => localStorage.setItem('ui.nauka.widok', 'linia'))

const baza = () =>
  page.evaluate(async () => {
    const req = indexedDB.open('kompendium')
    await new Promise((r) => (req.onsuccess = r))
    const db = req.result
    const wez = (t) => new Promise((r) => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess = () => r(q.result) })
    const [nauka, concepts] = [await wez('nauka'), await wez('concepts')]
    db.close()
    return { nauka, concepts }
  })

await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const T = db.transaction(['concepts', 'versions', 'paths', 'nauka', 'subpages'], 'readwrite')
  const now = new Date().toISOString()
  const nodes = []
  const kaf = (id, nazwa, typ = 'definicja') => {
    T.objectStore('concepts').put({ id, name: nazwa, type: typ, pathId: 'p', currentVersionId: 'v' + id, folderId: null, tags: [], createdAt: now, updatedAt: now, order: nodes.length })
    T.objectStore('versions').put({ id: 'v' + id, conceptId: id, version: 1, content: 'Treść: ' + nazwa, sourceRefs: [], createdAt: now, updatedAt: now })
    nodes.push({ id: 'n' + id, kind: 'block', conceptId: id, versionId: null, subpageId: null, x: 0, y: nodes.length * 100 })
  }
  nodes.push({ id: 'hA', kind: 'heading', text: 'Logika', level: 1, x: 0, y: 0 })
  kaf('a1', 'Zdanie'); kaf('a2', 'Wartość logiczna')
  nodes.push({ id: 'tN', kind: 'text', text: 'Notatka w środku', x: 0, y: 300 })
  kaf('a3', 'Zmienna zdaniowa'); kaf('a4', 'Ćwiczenie', 'zadanie')
  kaf('x1', 'Obcy kafelek')
  kaf('a5', 'Spójniki')
  nodes.push({ id: 'hB', kind: 'heading', text: 'Zbiory', level: 1, x: 0, y: 900 })
  kaf('b1', 'Zbiór'); kaf('b2', 'Podzbiór')
  const edges = nodes.slice(1).map((n, i) => ({ id: 'e' + i, from: nodes[i].id, to: n.id }))
  T.objectStore('paths').put({ id: 'p', name: 'Wstęp', folderId: null, order: 0, nodes, edges, createdAt: now, updatedAt: now })
  T.objectStore('concepts').put({ id: 'z1', name: 'Zadanie z paska', type: 'zadanie', pathId: 'p', currentVersionId: 'zv1', folderId: null, tags: [], createdAt: now, updatedAt: now, order: 99 })
  T.objectStore('versions').put({ id: 'zv1', conceptId: 'z1', version: 1, content: 'Policz coś', sourceRefs: [], createdAt: now, updatedAt: now })
  T.objectStore('concepts').put({ id: 'z2', name: 'Do usunięcia', type: 'zadanie', pathId: 'p', currentVersionId: 'zv2', folderId: null, tags: [], createdAt: now, updatedAt: now, order: 100 })
  T.objectStore('versions').put({ id: 'zv2', conceptId: 'z2', version: 1, content: 'Nic', sourceRefs: [], createdAt: now, updatedAt: now })
  // sektor przerwany obcym kafelkiem, z notatką w środku (nie należy do sektora)
  T.objectStore('nauka').put({ id: 's1', rodzaj: 'sektor', pathId: 'p', nazwa: 'Logika', wezly: ['na1', 'na2', 'na3', 'na4', 'na5'], kolor: '#e07a5f', etap: 'nowy', powtorek: 0, ostatniaRozszerzona: 0, zadania: ['z1', 'z2'], utworzono: now, zmieniono: now })
  await new Promise((r) => (T.oncomplete = r))
})
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(600)
await page.click('.path-item:has-text("Wstęp")')
await page.click('.view-switch button:has-text("Nauka")')
await page.waitForSelector('.panel-nauki')

// --- pasma i pasek zadań ---
await page.locator('.linear-seg[data-seg="na5"]').scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
check('notatka w środku sektora dostaje jego pasmo', (await page.locator('.linear-seg[data-seg="tN"].sektor-wypelnienie').count()) === 1)
check('obcy kafelek przerywa pasmo', (await page.locator('.linear-seg[data-seg="nx1"].w-sektorze').count()) === 0)
check('pasek zadań tylko raz, na samym końcu sektora', (await page.locator('.zadania-pasek').count()) === 1 &&
  (await page.locator('.linear-seg[data-seg="na5"] .zadania-pasek').count()) === 1)

// --- zadanie z paska do Linii ---
const pasek = page.locator('.zadania-pasek')
await pasek.locator('.zadania-pasek-glowa').click()
await pasek.locator('[data-zadanie="z1"] .zadania-menu-btn').click()
await page.click('.menu-zadania button:has-text("Wstaw do Linii")')
await page.waitForTimeout(1200)
let d = await baza()
const s1 = d.nauka.find((j) => j.id === 's1')
const nowyWezel = await page.evaluate(() => [...document.querySelectorAll('.linear-seg[data-seg]')].map((e) => e.dataset.seg))
const zLinii = s1.wezly.find((w) => !['na1', 'na2', 'na3', 'na4', 'na5'].includes(w))
check('zadanie z paska staje w Linii na końcu sektora', !s1.zadania.includes('z1') && !!zLinii &&
  nowyWezel.indexOf(zLinii) === nowyWezel.indexOf('na5') + 1, JSON.stringify(s1.wezly))

// --- kafelek „Zadanie" z Linii do paska ---
await page.locator('.linear-seg[data-seg="na4"] .linear-content').click({ button: 'right' })
await page.click('.menu-nauki button:has-text("Przenieś do paska zadań")')
await page.waitForTimeout(1200)
d = await baza()
const s1b = d.nauka.find((j) => j.id === 's1')
check('kafelek „Zadanie" z Linii przechodzi do paska', s1b.zadania.includes('a4') && !s1b.wezly.includes('na4') &&
  (await page.locator('.linear-seg[data-seg="na4"]').count()) === 0 && d.concepts.some((c) => c.id === 'a4'))

// --- usuwanie zadania po pytaniu ---
await page.locator('.zadania-pasek').first().scrollIntoViewIfNeeded()
if (!(await page.locator('.zadania-pasek.otwarty').count())) await page.locator('.zadania-pasek-glowa').click()
await page.locator('[data-zadanie="z2"] .zadania-menu-btn').click()
await page.click('.menu-zadania button:has-text("Usuń zadanie")')
await potwierdz(page)
await page.waitForTimeout(600)
d = await baza()
check('usunięte zadanie znika z sektora i z bazy', !d.nauka.find((j) => j.id === 's1').zadania.includes('z2') && !d.concepts.some((c) => c.id === 'z2'))

// --- Przegląd ---
await page.click('.panel-nauki-zakladki button:has-text("Przegląd")')
await page.waitForSelector('.przeglad-lista')
check('Przegląd: kulka na każdy kafelek i notatkę, kreska na rozdział',
  (await page.locator('.przeglad-wiersz.rodzaj-heading').count()) === 2 && (await page.locator('.przeglad-wiersz.rodzaj-text').count()) === 1)
check('Przegląd: sektor jako barwny odcinek z podpisem', (await page.locator('.przeglad-sektor:has-text("Logika")').count()) === 1 &&
  (await page.locator('.przeglad-wiersz.w-sektorze').count()) >= 5)
await page.click('.przeglad-wiersz[data-wezel="hB"] .przeglad-rzad')
check('klik w rozdział zaznacza cały rozdział', (await page.locator('.przeglad-wiersz.zaznaczony').count()) === 3)
await page.click('.przeglad-akcje button:has-text("Nowy sektor")')
await podaj(page, 'Zbiory')
await page.waitForTimeout(500)
d = await baza()
check('z rozdziału w Przeglądzie powstaje sektor', d.nauka.find((j) => j.nazwa === 'Zbiory')?.wezly.join() === 'hB,nb1,nb2')
// przeciąganie: obcy kafelek i spójniki
const r1 = await page.locator('.przeglad-wiersz[data-wezel="nx1"] .przeglad-rzad').boundingBox()
const r2 = await page.locator('.przeglad-wiersz[data-wezel="nb1"] .przeglad-rzad').boundingBox()
await page.mouse.move(r1.x + 10, r1.y + r1.height / 2)
await page.mouse.down()
await page.mouse.move(r2.x + 10, r2.y + r2.height / 2, { steps: 8 })
await page.mouse.up()
const ileZaz = await page.locator('.przeglad-wiersz.zaznaczony').count()
check('przeciągnięcie zaznacza zakres', ileZaz >= 4, String(ileZaz))
await page.click('.przeglad-wiersz[data-wezel="nx1"] .przeglad-rzad')
await page.click(".przeglad-akcje button:has-text('do „Logika')")
await page.waitForTimeout(500)
d = await baza()
check('„do sektora" z Przeglądu dokłada kafelek', d.nauka.find((j) => j.id === 's1').wezly.includes('nx1'))
check('po dołożeniu pasmo już nie jest przerwane', (await page.locator('.linear-seg[data-seg="nx1"].w-sektorze').count()) === 1)

// --- widok Sektory (domyślny środek Nauki) ---
await page.click('.widok-nauki-switch button:has-text("Sektory")')
await page.waitForSelector('.widok-sektorow .ws-lista')
check('Sektory: przełącznik zapamiętuje wybór', (await page.evaluate(() => localStorage.getItem('ui.nauka.widok'))) === 'sektory')
check('Sektory: Przegląd w panelu znika (byłby powtórzeniem)', (await page.locator('.panel-nauki-zakladki button:has-text("Przegląd")').count()) === 0)
check('Sektory: nagłówek sektora z liczbą kafelków i etapem', (await page.locator('.ws-sektor:has-text("Logika")').innerText()).includes('kaf.') &&
  (await page.locator('.ws-sektor:has-text("Logika")').innerText()).includes('nie uczony'))
check('Sektory: karta z rodzajem, nazwą i podglądem treści', (await page.locator('.ws-wiersz[data-seg="na1"] .ws-karta').innerText()).includes('Zdanie') &&
  (await page.locator('.ws-wiersz[data-seg="na1"] .ws-podglad').innerText()).includes('Treść: Zdanie'))
check('Sektory: zadanie z paska na końcu sektora', (await page.locator('.ws-wiersz.rodzaj-zadanie-paska:has-text("Kafelek")').count()) +
  (await page.locator('.ws-wiersz.rodzaj-zadanie-paska').count()) >= 1)
check('Sektory: notatka w środku sektora w jego paśmie', (await page.locator('.ws-wiersz[data-seg="tN"].w-sektorze.wypelnienie').count()) === 1)
await page.click('.ws-wiersz[data-seg="na2"] .ws-karta')
check('Sektory: klik w kartę rozwija treść', (await page.locator('.ws-wiersz[data-seg="na2"] .ws-karta.rozwinieta').count()) === 1)
// zaznaczanie przeciąganiem po osi i nowy sektor
const o1 = await page.locator('.ws-wiersz[data-seg="nb1"] .ws-os').boundingBox()
const o2 = await page.locator('.ws-wiersz[data-seg="nb2"] .ws-os').boundingBox()
await page.mouse.move(o1.x + o1.width / 2, o1.y + 12)
await page.mouse.down()
await page.mouse.move(o2.x + o2.width / 2, o2.y + 12, { steps: 6 })
await page.mouse.up()
check('Sektory: przeciągnięcie po osi zaznacza', (await page.locator('.ws-wiersz.zaznaczony').count()) === 2)
check('Sektory: zaznaczenie widać w panelu', (await page.locator('.panel-nauki-akcje .btn-primary').innerText()).includes('(2)'))
await page.click('.ws-akcje button:has-text("Nowy sektor")')
await podaj(page, 'Dwa zbiory')
await page.waitForTimeout(500)
d = await baza()
check('Sektory: nowy sektor z zaznaczonych', d.nauka.find((j) => j.nazwa === 'Dwa zbiory')?.wezly.join() === 'nb1,nb2')
// prawy przycisk: menu nauki
await page.locator('.ws-wiersz[data-seg="hB"] .ws-rozdzial').click({ button: 'right' })
check('Sektory: prawy przycisk na rozdziale — „Zrób sektor z rozdziału"', (await page.locator('.menu-nauki:has-text("Zrób sektor z rozdziału")').count()) === 1)
await page.keyboard.press('Escape')
await page.mouse.click(5, 300)
// wybieranie klikaniem
await page.click('.karta-sektora:has-text("Dwa zbiory") button:has-text("Wybierz kafelki")')
await page.click('.ws-wiersz[data-seg="nb2"] .ws-karta')
await page.waitForTimeout(400)
d = await baza()
check('Sektory: w trybie wybierania klik w kartę wyjmuje z sektora', d.nauka.find((j) => j.nazwa === 'Dwa zbiory')?.wezly.join() === 'nb1')
await page.click('.ws-wybieranie button:has-text("Gotowe")')
// z powrotem na pełną Linię
await page.click('.widok-nauki-switch button:has-text("Pełna linia")')
check('przełącznik wraca do pełnej Linii', (await page.locator('.nauka-uklad .linear-view').count()) === 1)

// --- przerwanie nauki: nic nie zaliczone, mapa zostaje ---
await page.evaluate(async () => {
  const req = indexedDB.open('kompendium'); await new Promise((r) => (req.onsuccess = r))
  const t = req.result.transaction('nauka', 'readwrite'); const st = t.objectStore('nauka')
  const q = st.get('s1'); await new Promise((r) => (q.onsuccess = r))
  st.put({ ...q.result, mapa: 'Moja mapa' }); await new Promise((r) => (t.oncomplete = r)); req.result.close()
})
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(600)
await page.click('.path-item:has-text("Wstęp")')
await page.click('.view-switch button:has-text("Nauka")')
await page.waitForSelector('.panel-nauki')
await page.locator('.karta-sektora[data-sektor="s1"] button:has-text("Zacznij naukę")').click()
await potwierdz(page)
// start otwiera tryb mapowania; ściąga schowana pod żarówką
await page.waitForSelector('.tm')
check('start otwiera tryb mapowania, ściąga schowana', (await page.locator('.tm .sciaga .tm-ikona').isVisible()) &&
  (await page.locator('.sciaga-okno').count()) === 0 &&
  (await page.locator('.panel-nauki-zakladki button:has-text("Pytania")').count()) === 0)
await page.click('.tm-glowa button[aria-label="Schowaj tryb mapowania"]')
await page.waitForSelector('.tm', { state: 'detached' })
await page.click('.panel-nauki-zakladki button:has-text("Sektory")')
await page.click('.karta-sektora[data-sektor="s1"] .karta-przerwij')
await potwierdz(page)
await page.waitForTimeout(400)
d = await baza()
const przerwany = d.nauka.find((j) => j.id === 's1')
check('„Przerwij naukę": sektor znów nieuczony, mapa zostaje', przerwany.etap === 'nowy' && przerwany.mapa === 'Moja mapa' && !przerwany.karta)

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(problems.length === 0 ? '>>> WSZYSTKO POPRAWNE' : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`)
await browser.close()
if (problems.length || errors.length) process.exit(1)
