// Etap zadań powtórki zero na osobnym ekranie: „+ Nowe zadanie" (kafelek
// z treścią i rozwiązaniem), zadania od czatu (polecenie zna wszystkie
// dotychczasowe zadania sektora, odpowiedź czytana i dodawana po przejrzeniu),
// usuwanie, potem test zakryty z zadaniami; „Pomiń zadania" — test i tak jest;
// próba zadań bez zapisu.
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
await page.evaluate(() => localStorage.removeItem('ui.nauka.polecenieZadania'))

const baza = () =>
  page.evaluate(async () => {
    const req = indexedDB.open('kompendium')
    await new Promise((r) => (req.onsuccess = r))
    const db = req.result
    const wez = (t) => new Promise((r) => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess = () => r(q.result) })
    const out = {
      nauka: await wez('nauka'),
      concepts: await wez('concepts'),
      versions: await wez('versions'),
      subpages: await wez('subpages'),
      historia: await wez('historia'),
    }
    db.close()
    return out
  })
const czekaj = async (f, ms = 6000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await f(await baza())) return true
    await page.waitForTimeout(150)
  }
  return false
}

const termin = new Date(Date.now() + 5 * 86400000).toISOString()
await page.evaluate(async (termin) => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const T = db.transaction(['concepts', 'versions', 'paths', 'nauka', 'subpages'], 'readwrite')
  const now = new Date().toISOString()
  const nodes = []
  for (const [id, n] of [['c1', 'Kula'], ['c2', 'Otoczenie']]) {
    T.objectStore('concepts').put({ id, name: n, type: 'definicja', pathId: 'p', currentVersionId: 'v' + id, folderId: null, tags: [], createdAt: now, updatedAt: now, order: 1 })
    T.objectStore('versions').put({ id: 'v' + id, conceptId: id, version: 1, content: 'Treść: ' + n, sourceRefs: [], createdAt: now, updatedAt: now })
    nodes.push({ id: 'n' + id, kind: 'block', conceptId: id, versionId: null, subpageId: null, x: 0, y: nodes.length * 100 })
  }
  // stare zadanie sektora — czat ma je znać
  T.objectStore('concepts').put({ id: 'z0', name: 'Stare zadanie', type: 'zadanie', pathId: 'p', currentVersionId: 'vz0', folderId: null, tags: [], createdAt: now, updatedAt: now, order: 1 })
  T.objectStore('versions').put({ id: 'vz0', conceptId: 'z0', version: 1, content: 'Pokaż, że kula jest otwarta.', sourceRefs: [], createdAt: now, updatedAt: now })
  T.objectStore('subpages').put({ id: 'sz0', conceptId: 'z0', versionId: 'vz0', name: 'Rozwiązanie', content: 'Nierówność trójkąta.', order: 1, createdAt: now, updatedAt: now })
  const edges = [{ id: 'e0', from: 'nc1', to: 'nc2' }]
  T.objectStore('paths').put({ id: 'p', name: 'Topologia', folderId: null, order: 0, nodes, edges, createdAt: now, updatedAt: now })
  const karta = { due: termin, stability: 5, difficulty: 5, scheduled_days: 5, reps: 1, lapses: 0, learning_steps: 0, state: 2, last_review: now }
  T.objectStore('nauka').put({ id: 's1', rodzaj: 'sektor', pathId: 'p', nazwa: 'Kule', wezly: ['nc1', 'nc2'], kolor: '#5b8def', etap: 'zadania', karta, termin, powtorek: 0, ostatniaRozszerzona: 0, zadania: ['z0'], utworzono: now, zmieniono: now })
  T.objectStore('nauka').put({ id: 's2', rodzaj: 'sektor', pathId: 'p', nazwa: 'Bez zadań', wezly: ['nc1'], kolor: '#c55', etap: 'zadania', karta, termin, powtorek: 0, ostatniaRozszerzona: 0, utworzono: now, zmieniono: now })
  await new Promise((r) => (T.oncomplete = r))
}, termin)
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(400)
await page.click('.path-item:has-text("Topologia")')
await page.click('.view-switch button:has-text("Nauka")')
const K = '.karta-sektora[data-sektor="s1"]'
const E = '.sesja-czat-proba'
await page.waitForSelector(`${K} [data-zadania]`)
check('karta: „Zadania" i „Test zakryty", bez listy zadań w karcie', (await page.locator(`${K} [data-zadania]`).count()) === 1 &&
  (await page.locator(`${K} .zadania-sektora`).count()) === 0 && (await page.locator(`${K} button:has-text("Bez zadań")`).count()) === 0)

// --- ekran zadań ---
await page.click(`${K} [data-zadania]`)
await page.waitForSelector(`${E} .etap-zadan`)
check('ekran zadań na całe okno', (await page.locator('.sesja-rodzaj').textContent()) === 'Zadania' &&
  (await page.evaluate(() => !!document.elementFromPoint(60, 300)?.closest('.sesja-ekran'))))
check('lista: stare zadanie', (await page.locator(`${E} .ez-zadanie`).count()) === 1 && (await page.locator(`${E} .ez-zadanie`).innerText()).includes('Stare zadanie'))

// + Nowe zadanie
await page.click(`${E} [data-nowe-zadanie]`)
await page.waitForSelector(`${E} .ez-zadanie.otwarta`)
const nowa = page.locator(`${E} .ez-zadanie.otwarta`)
await nowa.locator('.ez-nazwa-pole').fill('Moje zadanie')
await nowa.locator('textarea').nth(0).fill('Udowodnij, że przecięcie dwóch kul zawiera kulę.')
await nowa.locator('textarea').nth(1).fill('Weź mniejszy promień.')
check('„+ Nowe zadanie" → kafelek-zadanie z treścią i rozwiązaniem', await czekaj((b) => {
  const s = b.nauka.find((j) => j.id === 's1')
  const c = b.concepts.find((x) => x.name === 'Moje zadanie')
  if (!c || !s.zadania.includes(c.id)) return false
  const v = b.versions.find((x) => x.id === c.currentVersionId)
  const r = b.subpages.find((x) => x.conceptId === c.id && x.name === 'Rozwiązanie')
  return v?.content.includes('przecięcie') && r?.content === 'Weź mniejszy promień.'
}))

// zadania od czatu
await page.click(`${E} .ez-sekcja button:has-text("Tylko kopiuj")`)
await page.waitForTimeout(600)
const pol = await page.evaluate(() => navigator.clipboard.readText())
check('polecenie: zna wszystkie dotychczasowe zadania sektora', pol.includes('Stare zadanie: Pokaż, że kula jest otwarta.') && pol.includes('Moje zadanie: Udowodnij'))
check('polecenie: nie powtarzaj, wzór ZADANIE/TREŚĆ/ROZWIĄZANIE, materiał', pol.includes('NIE powtarzaj') && pol.includes('ZADANIE:') && pol.includes('ROZWIĄZANIE:') && pol.includes('Treść: Kula'))
await page.fill(`${E} textarea.ez-wklej`, 'Proszę:\n```\nZADANIE: Kula dyskretna\nTREŚĆ:\nOpisz kulę o promieniu 1/2.\nROZWIĄZANIE:\nTylko środek.\n---\nZADANIE: **Otwartość**\nTREŚĆ:\nCzy [0,1) jest otwarty?\nROZWIĄZANIE:\nNie.\n```')
await page.waitForSelector(`${E} .ez-od-czatu li`)
check('odczyt: 2 zadania od czatu do przejrzenia, zaznaczone', (await page.locator(`${E} .ez-od-czatu li`).count()) === 2 &&
  (await page.locator(`${E} .ez-od-czatu input:checked`).count()) === 2 && (await page.locator(`${E} .ez-od-czatu`).innerText()).includes('Otwartość'))
await page.locator(`${E} .ez-od-czatu input`).nth(1).uncheck()
await page.click(`${E} [data-dodaj-od-czatu]`)
check('dodane tylko zaznaczone, z rozwiązaniem', await czekaj((b) => {
  const s = b.nauka.find((j) => j.id === 's1')
  const c = b.concepts.find((x) => x.name === 'Kula dyskretna')
  return !!c && s.zadania.length === 3 && !b.concepts.some((x) => x.name === 'Otwartość') &&
    b.subpages.some((x) => x.conceptId === c.id && x.content === 'Tylko środek.')
}))
await page.waitForFunction(() => document.querySelectorAll('.sesja-czat-proba .ez-zadanie').length === 3)

// usunięcie
await page.locator(`${E} .ez-zadanie:has-text("Stare zadanie") .ez-usun`).click()
await page.click('.ask-dialog .btn-danger-strong')
check('usuwanie zadania (po pytaniu)', await czekaj((b) => !b.nauka.find((j) => j.id === 's1').zadania.includes('z0')))

// test zakryty z zadaniami
await page.waitForSelector(`${E} [data-test-koncowy]:has-text("z zadaniami (2)")`)
await page.click(`${E} [data-test-koncowy]`)
await page.waitForSelector('.sesja-element')
check('test zakryty: kafelki i zadania', (await page.locator('.sesja-element').count()) === 4 && (await page.locator('.sesja-element-zadanie').count()) === 2)
check('treść zadania widać, rozwiązanie zakryte', (await page.locator('.sesja-element-zadanie').first().innerText()).includes('przecięcie') &&
  !(await page.locator('.sesja-element-zadanie').first().innerText()).includes('mniejszy promień'))
for (let i = 0; i < 4; i++) {
  await page.locator('.sesja-element').nth(i).locator('button:has-text("Sprawdź")').click()
  await page.locator('.sesja-element').nth(i).locator('button:has-text("Tak")').click()
}
await page.click('.sesja-zapisz')
await page.waitForSelector('.sesja-wynik')
check('test zaliczony → powtórka zero skończona', (await page.locator('.sesja-wynik').innerText()).includes('powtórka zero skończona'))
let d = await baza()
const s1 = d.nauka.find((j) => j.id === 's1')
check('sektor w powtórkach, termin bez zmian', s1.etap === 'powtorki' && s1.termin === termin)
await page.click('.sesja-wynik button:has-text("Gotowe")')

// --- „Pomiń zadania": test zakryty i tak ---
const K2 = '.karta-sektora[data-sektor="s2"]'
await page.click(`${K2} [data-zadania]`)
await page.waitForSelector(`${E} [data-test-koncowy]`)
check('bez zadań: „Pomiń zadania — test zakryty"', (await page.locator(`${E} [data-test-koncowy]`).innerText()).includes('Pomiń zadania'))
await page.click(`${E} [data-test-koncowy]`)
await page.waitForSelector('.sesja-element')
check('pominięte zadania: test zakryty samych kafelków', (await page.locator('.sesja-element').count()) === 1 && (await page.locator('.sesja-element-zadanie').count()) === 0)
await page.locator('.sesja-element button:has-text("Sprawdź")').click()
await page.locator('.sesja-element button:has-text("Tak")').click()
await page.click('.sesja-zapisz')
await page.waitForSelector('.sesja-wynik')
check('po pominięciu i teście: powtórki', await czekaj((b) => b.nauka.find((j) => j.id === 's2').etap === 'powtorki'))
await page.click('.sesja-wynik button:has-text("Gotowe")')

// --- próba zadań: nic się nie zapisuje ---
const przed = JSON.stringify(await baza())
await page.click('.sidebar-foot-btn[title*="Ustawienia"], .sidebar-foot-btn:has-text("Ustawienia")')
await page.click('.settings-nav-item:has-text("Próba")')
await page.waitForSelector('[data-proba-zadania]')
await page.click('[data-proba-zadania]')
await page.waitForSelector(`${E} .etap-zadan`)
check('próba zadań: plakietka „Próba"', await page.locator('.sesja-proba').isVisible())
await page.click(`${E} [data-nowe-zadanie]`)
await page.locator(`${E} .ez-zadanie.otwarta .ez-nazwa-pole`).fill('Zadanie na niby')
await page.click(`${E} .test-czatem-przyklady button`)
await page.click(`${E} [data-dodaj-od-czatu]`)
await page.waitForTimeout(300)
check('próba: zadania w pamięci (własne i od czatu)', (await page.locator(`${E} .ez-zadanie`).count()) >= 3)
check('próba: co byłoby dalej', (await page.locator(`${E} .settings-status`).innerText()).includes('test zakryty z zadaniami'))
await page.click('.sesja-glowa button:has-text("Wróć")')
await page.waitForTimeout(400)
check('po próbie baza bez zmian', JSON.stringify(await baza()) === przed)

console.log(errors.length ? `Błędy konsoli:\n${errors.join('\n')}` : '✓ bez błędów konsoli')
await browser.close()
if (problems.length || errors.length) {
  console.log(`\n${problems.length} problem(ów)`)
  process.exit(1)
}
console.log('\nWszystko OK')
