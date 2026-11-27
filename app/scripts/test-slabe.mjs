// Słabe kafelki: kilka słabych z jednego sektora to jeden test zakryty,
// kafelek osobno goni sektor własną osią (FSRS), a gdy na „Tak" jego odstęp
// sięga odstępu sektora — dogonił: przestaje być słaby i idzie z sektorem
// (termin sektora, bez wyprzedzania). Niesłaby kafelek ma termin sektora.
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
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')

const baza = () =>
  page.evaluate(async () => {
    const req = indexedDB.open('kompendium')
    await new Promise((r) => (req.onsuccess = r))
    const db = req.result
    const q = db.transaction('pamiec').objectStore('pamiec').getAll()
    await new Promise((r) => (q.onsuccess = r))
    db.close()
    return q.result
  })

// sektor w powtórkach (powtórka przed chwilą, termin jutro — odstęp 1 dzień),
// dwa słabe kafelki na dziś, trzeci niesłaby z terminem za 5 dni
await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const T = db.transaction(['concepts', 'versions', 'paths', 'nauka', 'pamiec'], 'readwrite')
  const teraz = Date.now()
  const iso = (ms) => new Date(ms).toISOString()
  const D = 86400000
  const now = iso(teraz)
  const nodes = []
  for (let i = 0; i < 3; i++) {
    T.objectStore('concepts').put({ id: 'sc' + i, name: 'Nawias ' + i, type: 'definicja', currentVersionId: 'sv' + i, folderId: null, tags: [], createdAt: now, updatedAt: now, order: 500 + i })
    T.objectStore('versions').put({ id: 'sv' + i, conceptId: 'sc' + i, version: 1, content: 'Treść nawiasu ' + i, sourceRefs: [], createdAt: now, updatedAt: now })
    nodes.push({ id: 'sn' + i, kind: 'block', conceptId: 'sc' + i, versionId: null, subpageId: null, x: 0, y: i * 200 })
  }
  T.objectStore('paths').put({ id: 'sp', name: 'Logika', folderId: null, order: 0, nodes, edges: [], createdAt: now, updatedAt: now })
  const ostatnia = iso(teraz - 60000)
  const jutro = iso(teraz + D)
  T.objectStore('nauka').put({
    id: 'ss', rodzaj: 'sektor', pathId: 'sp', nazwa: 'Spójniki', kolor: '#3d9970', wezly: ['sn0', 'sn1', 'sn2'],
    etap: 'powtorki', powtorek: 1, ostatniaRozszerzona: 0, utworzono: now, zmieniono: now, ostatnia: ostatnia,
    karta: { due: jutro, stability: 2, difficulty: 5, scheduled_days: 1, reps: 2, lapses: 0, learning_steps: 0, state: 2, last_review: ostatnia },
    termin: jutro,
  })
  const karta = (due, last) => ({ due, stability: 1, difficulty: 6, scheduled_days: 1, reps: 1, lapses: 0, learning_steps: 0, state: 2, last_review: last })
  const wczoraj = iso(teraz - D)
  for (const [i, slaby, termin] of [[0, true, iso(teraz - 1000)], [1, true, iso(teraz - 1000)], [2, false, iso(teraz + 5 * D)]]) {
    T.objectStore('pamiec').put({ klucz: 'sc' + i, karta: karta(termin, wczoraj), termin, slaby, wpadki: 0, jednostkaId: 'ss', pathId: 'sp', nodeId: 'sn' + i, zmieniono: wczoraj })
  }
  await new Promise((r) => (T.oncomplete = r))
})
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(800)

let pam = await baza()
const sektorTermin = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
check('niesłaby kafelek dostał termin sektora (przy starcie)', pam.find((p) => p.klucz === 'sc2').termin.slice(0, 10) === sektorTermin, pam.find((p) => p.klucz === 'sc2').termin)
check('słabe powtarzane osobno nie są ruszane', pam.filter((p) => p.slaby).length === 2 && pam.find((p) => p.klucz === 'sc0').termin < new Date().toISOString())

await page.click('.sidebar-powtorki')
await page.waitForSelector('.powtorki-pozycja', { timeout: 5000 }).catch(() => {})
const poz = page.locator('.powtorki-pozycja:has-text("Nawias 0")')
check('dwa słabe z jednego sektora to jedna pozycja', (await poz.count()) === 1 && (await poz.textContent()).includes('Nawias 1') && (await poz.textContent()).includes('Słabe kafelki (2)'), await poz.textContent().catch(() => ''))
await poz.locator('button:has-text("Zacznij")').click()
await page.waitForSelector('.sesja-element')
check('jeden test zakryty z obu', (await page.locator('.sesja-element').count()) === 2 && (await page.locator('.sesja-rodzaj').textContent()).includes('Słabe kafelki sektora'))
check('bez wyboru ocen i dni', (await page.locator('.sesja-ocena-btn').count()) === 0)
const e0 = page.locator('.sesja-element').nth(0)
await e0.locator('button:has-text("Sprawdź")').click()
await e0.locator('button:has-text("Tak")').click()
const e1 = page.locator('.sesja-element').nth(1)
await e1.locator('button:has-text("Podejrzyj")').click()
const podglad = await page.locator('ul.sesja-osobno').innerText()
check('podgląd: Tak dogonił sektor (jutro), Nie dalej słaby', /Nawias 0.*dogonił sektor.*jutro/.test(podglad) && /Nawias 1.*dalej słaby/.test(podglad), podglad)
await page.click('.sesja-zapisz')
await page.waitForSelector('.sesja-wynik')
const wynik = await page.locator('.sesja-wynik').innerText()
check('wynik opisuje każdy kafelek (bez „fiszka wróci dziś")', wynik.includes('dogonił sektor') && wynik.includes('dalej słaby') && !wynik.includes('fiszka'), wynik)
pam = await baza()
const p0 = pam.find((p) => p.klucz === 'sc0')
const p1 = pam.find((p) => p.klucz === 'sc1')
check('Tak: nie jest słaby, termin = termin sektora', !p0.slaby && p0.termin.slice(0, 10) === sektorTermin, JSON.stringify({ s: p0.slaby, t: p0.termin }))
check('Nie: dalej słaby, własny termin z FSRS', p1.slaby && p1.termin === p1.karta.due)

await browser.close()
if (errors.length) console.log('Błędy w konsoli:\n' + errors.join('\n'))
console.log(problems.length || errors.length ? `\n✗ ${problems.length} problemów` : '\n✓ Wszystko działa')
process.exit(problems.length || errors.length ? 1 : 0)
