// Ustawienia → Próba: powiadomienia na pokaz, test zakryty i test czatem
// z dogrywką na prawdziwym sektorze — a w bazie nie zmienia się NIC.
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
const kontekst = await browser.newContext({ viewport: { width: 1500, height: 950 }, permissions: ['clipboard-read', 'clipboard-write'] })
const page = await kontekst.newPage()
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
    const out = { nauka: await wez('nauka'), pamiec: await wez('pamiec'), historia: await wez('historia') }
    db.close()
    return JSON.stringify(out)
  })

const termin = new Date(Date.now() + 10 * 86400000).toISOString()
await page.evaluate(async (termin) => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const T = db.transaction(['concepts', 'versions', 'paths', 'nauka', 'pamiec', 'historia'], 'readwrite')
  const now = new Date().toISOString()
  const nodes = []
  for (const [id, n] of [['c1', 'Kula'], ['c2', 'Otoczenie'], ['c3', 'Zbiór domknięty']]) {
    T.objectStore('concepts').put({ id, name: n, type: 'definicja', pathId: 'p', currentVersionId: 'v' + id, folderId: null, tags: [], createdAt: now, updatedAt: now, order: 1 })
    T.objectStore('versions').put({ id: 'v' + id, conceptId: id, version: 1, content: 'Treść: ' + n, sourceRefs: [], createdAt: now, updatedAt: now })
    nodes.push({ id: 'n' + id, kind: 'block', conceptId: id, versionId: null, subpageId: null, x: 0, y: nodes.length * 100 })
  }
  T.objectStore('paths').put({ id: 'p', name: 'Topologia', folderId: null, order: 0, nodes, edges: [], createdAt: now, updatedAt: now })
  const karta = { due: termin, stability: 10, difficulty: 5, scheduled_days: 10, reps: 2, lapses: 0, learning_steps: 0, state: 2, last_review: now }
  // sektor już nauczony — próba nie może go cofnąć ani dopisać mu historii
  T.objectStore('nauka').put({ id: 's1', rodzaj: 'sektor', pathId: 'p', nazwa: 'Kule', wezly: ['nc1', 'nc2', 'nc3'], kolor: '#5b8def', etap: 'powtorki', karta, termin, powtorek: 1, ostatniaRozszerzona: 0, mapa: 'kule → otoczenia', wymagania: { nc1: 'definicja i rysunek' }, utworzono: now, zmieniono: now })
  // drugi sektor — bez mapy
  T.objectStore('nauka').put({ id: 's2', rodzaj: 'sektor', pathId: 'p', nazwa: 'Bez mapy', wezly: ['nc3'], kolor: '#c55', etap: 'mapowanie', powtorek: 0, ostatniaRozszerzona: 0, utworzono: now, zmieniono: now })
  for (const k of ['c1', 'c2', 'c3']) T.objectStore('pamiec').put({ klucz: k, karta, slaby: false, termin, wpadki: 0, jednostkaId: 's1', pathId: 'p', zmieniono: now })
  T.objectStore('historia').put({ id: 'h1', kiedy: now, jednostkaId: 's1', typ: 'test', ocena: 3, kafelki: { c1: 'tak', c2: 'tak', c3: 'tak' } })
  await new Promise((r) => (T.oncomplete = r))
}, termin)
await page.reload()
await page.waitForSelector('text=Kompendium')
const przed = await baza()

const doProby = async () => {
  await page.click('.sidebar-foot-btn[title*="Ustawienia"], .sidebar-foot-btn:has-text("Ustawienia")')
  await page.click('.settings-nav-item:has-text("Próba")')
  await page.waitForSelector('[data-proba="test"]')
}
await doProby()

// --- powiadomienia na pokaz ---
await page.click('[data-proba="powiadomienia"] button:has-text("Test po przerwie")')
check('powiadomienie „test po przerwie" widać w programie', await page.locator('text=Przerwa minęła — czas na test sektora „Kule"').first().isVisible())

// --- test zakryty na próbę ---
await page.click('[data-proba="test"] button:has-text("Test po mapowaniu")')
await page.waitForSelector('.sesja-element')
check('sesja próbna: plakietka „Próba"', await page.locator('.sesja-proba').isVisible())
check('sesja próbna: to pierwszy test po mapowaniu', (await page.locator('.sesja-rodzaj').textContent()) === 'Test po mapowaniu')
await page.locator('.sesja-element').first().screenshot({ path: 'proba-kafelek.png' })
check('kafelek: z lewej zakryty, z prawej pole na odpowiedź', (await page.locator('.sesja-element').first().locator('.sesja-lewa .sesja-zakryte').count()) === 1 &&
  (await page.locator('.sesja-element').first().locator('.sesja-prawa textarea').count()) === 1)
check('wymagania pod nazwą kafelka', (await page.locator('.sesja-element[data-klucz="c1"] .sesja-wymagania').innerText()).includes('definicja i rysunek'))
check('mapa na górze i od razu do odkrycia', await page.locator('.sesja-mapa-pamiec button:has-text("Odkryj mapę")').isEnabled())
await page.click('.sesja-mapa-pamiec button:has-text("Odkryj mapę")')
check('po odkryciu mapa widoczna przy niej', (await page.locator('.sesja-mapa-pamiec .sesja-mapa').innerText()).includes('kule'))
await page.click('.sesja-mapa-porownaj .zaznacz-tak')
const ile = await page.locator('.sesja-element').count()
for (let i = 0; i < ile; i++) {
  await page.locator('.sesja-element').nth(i).locator('button:has-text("Sprawdź")').click()
  await page.locator('.sesja-element').nth(i).locator(i === 0 ? 'button:has-text("Nie")' : 'button:has-text("Tak")').click()
}
await page.locator('.sesja-element').nth(1).screenshot({ path: 'proba-odsloniety.png' })
check('po odsłonięciu: kafelek z lewej, twoja odpowiedź z prawej', (await page.locator('.sesja-element').nth(1).locator('.sesja-lewa .sesja-odkryta').count()) === 1 && (await page.locator('.sesja-element').nth(1).locator('.sesja-prawa .sesja-twoja').count()) === 1)
await page.locator('.sesja-zapisz').first().click()
await page.waitForSelector('.sesja-wynik')
const wynik = await page.locator('.sesja-wynik').innerText()
check('wynik próby policzony (jak naprawdę)', wynik.length > 20, wynik.slice(0, 120))
check('wynik też z plakietką „Próba"', await page.locator('.sesja-proba').isVisible())
check('wynik: liczby Tak/Częściowo/Nie i lista kafelków', (await page.locator('.sesja-wynik-liczba').count()) >= 3 &&
  (await page.locator('.sesja-wynik-lista li').count()) === ile && (await page.locator('.sesja-wynik-lista li.zaznacz-nie').count()) === 1)
await page.screenshot({ path: 'proba-wynik.png' })
check('próba: po teście od razu test czatem (jak w nauce)', (await page.locator('.sesja-wynik .czat-na-probe button:has-text("Test czatem")').count()) === 1 &&
  (await page.locator('.sesja-wynik').innerText()).includes('test czatem'))
await page.click('.sesja-wynik button:has-text("Gotowe")')
await page.waitForTimeout(500)
check('po teście na próbę baza bez zmian', (await baza()) === przed)

// sektor bez mapy: test bez części z mapą
await doProby()
await page.selectOption('.settings-row select', 's2')
await page.click('[data-proba="test"] button:has-text("Test po mapowaniu")')
await page.waitForSelector('.sesja-element')
check('sektor bez mapy: nie ma części z mapą', (await page.locator('.sesja-mapa-pamiec').count()) === 0)
await page.click('.sesja-glowa button:has-text("Wróć")')

// --- test czatem i dogrywka na próbę ---
await doProby()
await page.selectOption('.settings-row select', 's1')
await page.click('[data-proba="czat"] button:has-text("Zacznij test czatem")')
const [karta] = await Promise.all([
  kontekst.waitForEvent('page', { timeout: 5000 }).catch(() => null),
  page.click('[data-proba="czat"] button:has-text("Test czatem")'),
])
check('test czatem: otwiera czat', !!karta)
await karta?.close()
const polecenie = await page.evaluate(() => navigator.clipboard.readText())
check('test czatem: polecenie w schowku', polecenie.includes('Kula'), polecenie.slice(0, 60))
check('próba: bez „Pomiń czat"', (await page.locator('[data-proba="czat"] button:has-text("Pomiń")').count()) === 0)
await page.click('[data-proba="czat"] button:has-text("Są luki")')
await page.fill('[data-proba="czat"] .test-czatem-wklej textarea',
  'Super.\n**WYNIK: NIEZALICZONE**\nKAFELKI:\n- Kula: TAK — dobrze\n- Otoczenie: CZĘŚCIOWO — bez przykładu\n- Zbiór domknięty: NIE — myli z otwartym\nLUKI:\n- definicja otoczenia\nKLUCZ:\n- Otoczenie: zbiór zawierający kulę wokół punktu.')
check('odczyt odpowiedzi czatu: oceny kafelków', (await page.locator('[data-proba="czat"] .test-czatem-odczyt li').count()) === 3 &&
  (await page.locator('[data-proba="czat"] .test-czatem-odczyt li.zaznacz-nie').innerText()).includes('Zbiór domknięty'))
await page.click('[data-proba="czat"] button:has-text("Zapisz luki")')
await page.waitForSelector('[data-proba="czat"] .test-czatem-luki')
const luki = await page.locator('[data-proba="czat"] .test-czatem-luki pre').innerText()
check('dogrywka: same luki (bez ocen i klucza w środku)', luki.includes('definicja otoczenia') && !luki.includes('KLUCZ') && !luki.includes('Kula'), luki)
check('dogrywka: oceny kafelków i klucz odpowiedzi', (await page.locator('[data-proba="czat"] .test-czatem-luki .test-czatem-kafelki li').count()) === 3 &&
  (await page.locator('[data-proba="czat"] .test-czatem-klucz').count()) === 1)
check('„Tylko kopiuj" jest osobno', (await page.locator('[data-proba="czat"] button:has-text("Tylko kopiuj")').count()) === 1)
check('po lukach: dogrywka z lukami', (await page.locator('[data-proba="czat"] .test-czatem-luki').innerText()).includes('otoczenia') &&
  (await page.locator('[data-proba="czat"] button:has-text("Dogrywka")').count()) === 1)
await page.click('[data-proba="czat"] button:has-text("Zaliczone")')
check('dogrywka zaliczona: komunikat, co byłoby dalej', (await page.locator('[data-proba="czat"] .settings-status').innerText()).includes('Zaliczone'))
check('po czacie na próbę baza bez zmian', (await baza()) === przed)

console.log(`BŁĘDY KONSOLI: ${errors.length ? errors.join(' | ') : 'brak'}`)
await browser.close()
console.log(problems.length ? `\n>>> PROBLEMY: ${problems.length}` : '\n>>> WSZYSTKO POPRAWNE')
process.exit(problems.length ? 1 : 0)
