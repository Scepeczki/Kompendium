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
check('próba: po teście od razu test czatem (jak w nauce)', (await page.locator('.sesja-wynik .czat-na-probe .tcz-otworz').count()) === 1 &&
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
// próba czatu na cały ekran — wygląda jak prawdziwa nauka
const P = '.sesja-czat-proba'
await page.waitForSelector(P)
check('próba czatu na cały ekran, z plakietką „Próba"', (await page.locator('.sesja-rodzaj').textContent()) === 'Test czatem' && (await page.locator('.sesja-proba').isVisible()))
const [karta] = await Promise.all([
  kontekst.waitForEvent('page', { timeout: 5000 }).catch(() => null),
  page.click(`${P} .tcz-otworz`),
])
check('test czatem: otwiera czat', !!karta)
await karta?.close()
const polecenie = await page.evaluate(() => navigator.clipboard.readText())
check('test czatem: polecenie w schowku', polecenie.includes('Kula'), polecenie.slice(0, 60))
check('próba: bez „Pomiń czat"', (await page.locator(`${P} button:has-text("Pomiń")`).count()) === 0)
check('polecenie: wzór, zasady i przykład podsumowania', polecenie.includes('Zasady podsumowania') && polecenie.includes('Przykład (sektor z czterema kafelkami') && polecenie.includes('NIESPRAWDZONY') &&
  polecenie.includes('bloku kodu'))
check('próba: gotowe podsumowania do kliknięcia', (await page.locator(`${P} .test-czatem-przyklady button`).count()) >= 4)
// tak, jak poda to czat: blok kodu, nazwy z rodzajem, pusty klucz
await page.fill(`${P} .tcz-pole-wklej`,
  'Dzięki za rozmowę.\n```\nWYNIK: NIEZALICZONE\nKAFELKI:\n- Definicja: Kula: TAK — dobrze.\n- Otoczenie: CZĘŚCIOWO — bez przykładu.\n- Zbiór domknięty: NIE — pomylony.\nLUKI:\n- brak przykładu\nKLUCZ:\n- brak\n```')
await page.waitForTimeout(400)
await page.click(`${P} [data-pokaz-tak]`)
check('odczyt bloku kodu: 3 kafelki do zatwierdzenia', (await page.locator(`${P} .tcz-oceny > li`).count()) === 3)
await page.click(`${P} [data-wklej-ponownie]`)
await page.fill(`${P} .tcz-pole-wklej`,
  'Super.\n**WYNIK: NIEZALICZONE**\nKAFELKI:\n- Kula: TAK — dobrze\n- Otoczenie: CZĘŚCIOWO — bez przykładu\n- Zbiór domknięty: NIE — myli z otwartym\nLUKI:\n- Otoczenie: definicja otoczenia\n- Zbiór domknięty: myli z otwartym\nKLUCZ:\n- Otoczenie: zbiór zawierający kulę wokół punktu.')
await page.waitForTimeout(400)
await page.click(`${P} [data-pokaz-tak]`)
check('odczyt odpowiedzi czatu: oceny kafelków', (await page.locator(`${P} .tcz-oceny > li`).count()) === 3 &&
  (await page.locator(`${P} .tcz-oceny > li.zaznacz-nie`).innerText()).includes('Zbiór domknięty'))
await page.locator('.sesja-czat-proba').screenshot({ path: 'proba-czat-ocena.png' })
check('werdykt i co dalej przed zapisem', (await page.locator(`${P} .test-czatem-werdykt`).innerText()).includes('po zapisie: podsumowanie luk'))
await page.click(`${P} [data-zapisz-czat]`)
await page.waitForSelector(`${P} .tcz-luki`, { timeout: 5000 }).catch(() => console.log('BŁĘDY:', errors.join(' | ')))
check('po zapisie: skutki — ocena łączna (Tak + NIE = Nie)', (await page.locator(`${P} .tcz-tabela`).innerText()).includes('słaby, do poprawy'))
check('po zapisie: podsumowanie luk przy kafelkach (Otoczenie, Zbiór domknięty)', (await page.locator(`${P} .tcz-luka`).count()) === 2 &&
  (await page.locator(`${P} .tcz-luka`).first().innerText()).includes('Zbiór domknięty'))
check('po zapisie: wzorcowa odpowiedź przy Otoczeniu', (await page.locator(`${P} .tcz-luka .tcz-wzor`).count()) === 1)
check('po zapisie: „Co dalej" — popraw mapy, dogrywka', (await page.locator(`${P} [data-popraw-mapy]`).count()) === 1 &&
  (await page.locator(`${P} .tcz-krok-czat button:has-text("Dogrywka")`).count()) === 1)
await page.locator('.sesja-czat-proba').screenshot({ path: 'proba-czat-luki.png' })
check('„Tylko kopiuj" jest osobno', (await page.locator(`${P} button:has-text("Tylko kopiuj")`).count()) === 1)
await page.click(`${P} .test-czatem-przyklady button:has-text("Dogrywka zaliczona")`)
await page.click(`${P} [data-zapisz-czat]`)
await page.waitForSelector(`${P} .tcz-koniec`)
check('dogrywka zaliczona: komunikat, co byłoby dalej', (await page.locator(`${P} .tcz-skutki`).innerText()).includes('Zaliczone') &&
  (await page.locator(`${P} .tcz-koniec`).innerText()).includes('poszedłby dalej'))
await page.screenshot({ path: 'proba-czat.png', fullPage: true })
await page.click('.sesja-glowa button:has-text("Wróć")')
check('po czacie na próbę baza bez zmian', (await baza()) === przed)

console.log(`BŁĘDY KONSOLI: ${errors.length ? errors.join(' | ') : 'brak'}`)
await browser.close()
console.log(problems.length ? `\n>>> PROBLEMY: ${problems.length}` : '\n>>> WSZYSTKO POPRAWNE')
process.exit(problems.length ? 1 : 0)
