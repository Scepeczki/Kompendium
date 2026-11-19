// Sektory w widoku Nauka: spis z lewej, oś sektorów w środku (karty, strony
// kafelka, zaznaczanie przeciąganiem i rozdziałem), same sektory z prawej,
// pasmo przez notatkę w środku sektora, zadania na samym końcu sektora,
// zadanie z paska do Linii i z powrotem, usuwanie zadania po pytaniu.
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
  T.objectStore('subpages').put({ id: 'sp1', conceptId: 'a1', versionId: 'va1', name: 'Dowód', content: 'Treść dowodu', order: 0, createdAt: now, updatedAt: now })
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

// --- układ: spis z lewej, oś sektorów w środku, same sektory z prawej ---
await page.waitForSelector('.widok-sektorow .ws-lista')
check('Nauka: bez przełącznika „Pełna linia" i bez zakładek panelu', (await page.locator('.widok-nauki-switch').count()) === 0 &&
  (await page.locator('.panel-nauki-zakladki').count()) === 0 && (await page.locator('.nauka-uklad .linear-view').count()) === 0)
check('Spis: sektor z etapem, rozdziały i kafelki', (await page.locator('.spis-nauki .sn-sektor:has-text("Logika")').innerText()).includes('nie uczony') &&
  (await page.locator('.spis-nauki .sn-rozdzial').count()) === 2 && (await page.locator('.spis-nauki .sn-kafelek:has-text("Spójniki")').count()) === 1)
check('Spis: kafelki sektora z barwną kreską, obcy bez', (await page.locator('.spis-nauki .sn-w.w-sektorze:has-text("Zdanie")').count()) === 1 &&
  (await page.locator('.spis-nauki .sn-w.w-sektorze:has-text("Obcy kafelek")').count()) === 0)
// niskie okno — inaczej krótka ścieżka mieści się cała i nie ma czego przewijać
await page.setViewportSize({ width: 1500, height: 500 })
await page.click('.spis-nauki .sn-kafelek:has-text("Spójniki")')
await page.waitForTimeout(900)
const yPod = await page.locator('.ws-wiersz[data-seg="na5"]').boundingBox()
const yWidok = await page.locator('.widok-sektorow').boundingBox()
check('Spis: klik przewija oś do kafelka', yPod && yPod.y < yWidok.y + 150 && yPod.y >= yWidok.y - 5, `${yPod?.y} / ${yWidok.y}`)
check('Spis: bieżąca pozycja idzie za osią', (await page.locator('.spis-nauki .sn-poz.biezaca').innerText()).includes('Spójniki'))
await page.setViewportSize({ width: 1500, height: 950 })
check('Spis: bieżąca pozycja podświetlona', (await page.locator('.spis-nauki .sn-poz.biezaca').count()) === 1)
await page.click('.spis-nauki .sn-sektor:has-text("Logika")')
await page.waitForTimeout(300)
check('Spis: klik w sektor wybiera jego kartę w panelu', (await page.locator('.karta-sektora.aktywna[data-sektor="s1"]').count()) === 1)
await page.click('.spis-nauki button[aria-label="Schowaj spis"]')
check('Spis: chowa się i pamięta', (await page.locator('.spis-nauki').count()) === 0 &&
  (await page.evaluate(() => localStorage.getItem('ui.nauka.spis'))) === '0')
await page.click('.spis-nauki-otworz')
await page.waitForSelector('.spis-nauki')

// --- oś: notatka w paśmie, obcy przerywa, zadania na końcu ---
check('notatka w środku sektora dostaje jego pasmo', (await page.locator('.ws-wiersz[data-seg="tN"].w-sektorze.wypelnienie').count()) === 1)
check('obcy kafelek przerywa pasmo', (await page.locator('.ws-wiersz[data-seg="nx1"].w-sektorze').count()) === 0)
const kolejnosc = await page.evaluate(() => [...document.querySelectorAll('.ws-lista > li')].map((e) => e.dataset.seg ?? 'zad:' + e.dataset.zadanie))
check('zadania z paska na samym końcu sektora', kolejnosc.indexOf('zad:z1') === kolejnosc.indexOf('na5') + 1, kolejnosc.join())

// --- strony kafelka na rozwiniętej karcie ---
await page.click('.ws-wiersz[data-seg="na1"] .ws-karta')
check('rozwinięta karta: zakładki stron kafelka', (await page.locator('.ws-wiersz[data-seg="na1"] .ws-strony .page-chip').count()) === 2)
await page.click('.ws-wiersz[data-seg="na1"] .ws-strony .page-chip:has-text("Dowód")')
check('zakładka strony przełącza treść', (await page.locator('.ws-wiersz[data-seg="na1"] .ws-podglad').innerText()).includes('Treść dowodu') &&
  (await page.locator('.ws-wiersz[data-seg="na1"] .ws-karta.rozwinieta').count()) === 1)

// --- zadanie z paska do Linii ---
await page.locator('.ws-wiersz[data-zadanie="z1"] .ws-karta').click({ button: 'right' })
await page.click('.menu-zadania button:has-text("Wstaw do Linii")')
await page.waitForTimeout(1200)
let d = await baza()
const s1 = d.nauka.find((j) => j.id === 's1')
const zLinii = s1.wezly.find((w) => !['na1', 'na2', 'na3', 'na4', 'na5'].includes(w))
const poWstawieniu = await page.evaluate(() => [...document.querySelectorAll('.ws-lista > li[data-seg]')].map((e) => e.dataset.seg))
check('zadanie z paska staje w Linii na końcu sektora', !s1.zadania.includes('z1') && !!zLinii &&
  poWstawieniu.indexOf(zLinii) === poWstawieniu.indexOf('na5') + 1, JSON.stringify(s1.wezly))

// --- kafelek „Zadanie" z Linii do paska ---
await page.locator('.ws-wiersz[data-seg="na4"] .ws-karta').click({ button: 'right' })
await page.click('.menu-nauki button:has-text("Przenieś do paska zadań")')
await page.waitForTimeout(1200)
d = await baza()
const s1b = d.nauka.find((j) => j.id === 's1')
check('kafelek „Zadanie" z Linii przechodzi do paska', s1b.zadania.includes('a4') && !s1b.wezly.includes('na4') &&
  (await page.locator('.ws-wiersz[data-seg="na4"]').count()) === 0 && d.concepts.some((c) => c.id === 'a4'))

// --- usuwanie zadania po pytaniu ---
await page.locator('.ws-wiersz[data-zadanie="z2"] .ws-karta').click({ button: 'right' })
await page.click('.menu-zadania button:has-text("Usuń zadanie")')
await potwierdz(page)
await page.waitForTimeout(600)
d = await baza()
check('usunięte zadanie znika z sektora i z bazy', !d.nauka.find((j) => j.id === 's1').zadania.includes('z2') && !d.concepts.some((c) => c.id === 'z2'))

// --- sektor z rozdziału i dokładanie zaznaczonych ---
await page.locator('.ws-wiersz[data-seg="hB"] .ws-rozdzial').click({ button: 'right' })
check('prawy przycisk na rozdziale — „Zrób sektor z rozdziału"', (await page.locator('.menu-nauki:has-text("Zrób sektor z rozdziału")').count()) === 1)
await page.click('.menu-nauki button:has-text("Zrób sektor z rozdziału")')
await podaj(page, 'Zbiory')
await page.waitForTimeout(500)
d = await baza()
check('z rozdziału powstaje sektor', d.nauka.find((j) => j.nazwa === 'Zbiory')?.wezly.join() === 'hB,nb1,nb2', d.nauka.find((j) => j.nazwa === 'Zbiory')?.wezly.join())
check('Spis: nowy sektor od razu w spisie', (await page.locator('.spis-nauki .sn-sektor:has-text("Zbiory")').count()) === 1)
await page.click('.ws-wiersz[data-seg="nx1"] .ws-os', { position: { x: 10, y: 12 } })
check('klik na osi zaznacza, zaznaczenie widać w panelu', (await page.locator('.ws-wiersz.zaznaczony').count()) === 1 &&
  (await page.locator('.panel-nauki-akcje .btn-primary').innerText()).includes('(1)'))
await page.click(".ws-akcje button:has-text('do „Logika')")
await page.waitForTimeout(500)
d = await baza()
check('„do sektora" dokłada kafelek, pasmo już nie jest przerwane', d.nauka.find((j) => j.id === 's1').wezly.includes('nx1') &&
  (await page.locator('.ws-wiersz[data-seg="nx1"].w-sektorze').count()) === 1)
await page.locator('.ws-wiersz[data-seg="hB"] .ws-rozdzial').click({ button: 'right' })
await page.keyboard.press('Escape')
await page.mouse.click(5, 300)

// --- widok Sektory: karty ---
check('Sektory: nagłówek sektora z liczbą kafelków i etapem', (await page.locator('.ws-sektor:has-text("Logika")').innerText()).includes('kaf.') &&
  (await page.locator('.ws-sektor:has-text("Logika")').innerText()).includes('nie uczony'))
check('Sektory: karta z rodzajem, nazwą i podglądem treści', (await page.locator('.ws-wiersz[data-seg="na2"] .ws-karta').innerText()).includes('Wartość') &&
  (await page.locator('.ws-wiersz[data-seg="na2"] .ws-podglad').innerText()).includes('Treść: Wartość'))
// zaznaczanie przeciąganiem po osi i nowy sektor
const o1 = await page.locator('.ws-wiersz[data-seg="nb1"] .ws-os').boundingBox()
const o2 = await page.locator('.ws-wiersz[data-seg="nb2"] .ws-os').boundingBox()
await page.mouse.move(o1.x + o1.width / 2, o1.y + 12)
await page.mouse.down()
await page.mouse.move(o2.x + o2.width / 2, o2.y + 12, { steps: 6 })
await page.mouse.up()
check('Sektory: przeciągnięcie po osi zaznacza', (await page.locator('.ws-wiersz.zaznaczony').count()) === 2)
await page.click('.ws-akcje button:has-text("Nowy sektor")')
await podaj(page, 'Dwa zbiory')
await page.waitForTimeout(500)
d = await baza()
check('Sektory: nowy sektor z zaznaczonych', d.nauka.find((j) => j.nazwa === 'Dwa zbiory')?.wezly.join() === 'nb1,nb2')
// wybieranie klikaniem
await page.click('.karta-sektora:has-text("Dwa zbiory") button:has-text("Wybierz kafelki")')
await page.click('.ws-wiersz[data-seg="nb2"] .ws-karta')
await page.waitForTimeout(400)
d = await baza()
check('Sektory: w trybie wybierania klik w kartę wyjmuje z sektora', d.nauka.find((j) => j.nazwa === 'Dwa zbiory')?.wezly.join() === 'nb1')
await page.click('.ws-wybieranie button:has-text("Gotowe")')

// --- mapa sektora: przez kartę sektora, w trybie mapowania ---
await page.click('.karta-sektora[data-sektor="s1"] .karta-sektora-mapa')
await page.waitForSelector('.tm')
check('„Mapa" na karcie sektora otwiera tryb mapowania', await page.locator('.tm-plakietka:has-text("Mapa · Logika")').isVisible())
await page.click('.tm-glowa button[aria-label="Schowaj tryb mapowania"]')
await page.waitForSelector('.tm', { state: 'detached' })

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
  (await page.locator('.sciaga-okno').count()) === 0)
await page.click('.tm-glowa button[aria-label="Schowaj tryb mapowania"]')
await page.waitForSelector('.tm', { state: 'detached' })
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
