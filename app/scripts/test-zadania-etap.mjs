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
/** Wybrany kafelek-zadanie w kolumnie. */
const W = `${E} .ez2-kafelek.wl`
await page.waitForSelector(`${K} [data-zadania]`)
check('karta: „Zadania" i „Test zakryty", bez listy zadań w karcie', (await page.locator(`${K} [data-zadania]`).count()) === 1 &&
  (await page.locator(`${K} .zadania-sektora`).count()) === 0 && (await page.locator(`${K} button:has-text("Bez zadań")`).count()) === 0)

// --- ekran zadań ---
await page.click(`${K} [data-zadania]`)
await page.waitForSelector(`${E} .etap-zadan`)
check('ekran zadań na całe okno', (await page.locator('.sesja-rodzaj').textContent()) === 'Zadania' &&
  (await page.evaluate(() => !!document.elementFromPoint(60, 300)?.closest('.sesja-ekran'))))
check('lista z lewej: stare zadanie, w kolumnie jego kafelek', (await page.locator(`${E} .ez2-poz`).count()) === 1 &&
  (await page.locator(`${E} .ez2-poz`).innerText()).includes('Stare zadanie') && (await page.locator(`${E} [data-zadanie-edycja="z0"]`).count()) === 1)
check('„Dołóż": zadanie i z czatem', (await page.locator(`${E} .ez3-doloz [data-nowe-zadanie]`).count()) === 1 && (await page.locator(`${E} .ez3-doloz [data-z-czatem]`).count()) === 1)

// + Zadanie: schemat kafelka — polecenie, rozwiązanie, drugie rozwiązanie
const pisz = async (tekst) => {
  await page.click(`${W} .ez2-edytor .ProseMirror`)
  await page.keyboard.type(tekst)
}
await page.click(`${E} [data-nowe-zadanie]`)
await page.waitForFunction(() => document.querySelectorAll('.sesja-czat-proba .ez2-poz').length === 2)
await page.locator(`${W} .ez2-tytul`).fill('Moje zadanie')
check('kafelek jak w Linii: rodzaj, nazwa, strony Polecenie/Rozwiązanie/+ w nagłówku', (await page.locator(`${W}.script-block .script-block-head .ez2-strony`).innerText()).includes('Polecenie') &&
  (await page.locator(`${W} [data-strona="rozwiazanie"]`).count()) === 1 && (await page.locator(`${W} [data-dodaj-rozwiazanie]`).count()) === 1 &&
  (await page.locator(`${E} .ez2-kafelek`).count()) === 2)
await pisz('Udowodnij, że przecięcie dwóch kul zawiera kulę.')
await page.click(`${W} [data-strona="rozwiazanie"]`)
await pisz('Weź mniejszy promień.')
await page.click(`${W} [data-dodaj-rozwiazanie]`)
await page.waitForFunction(() => document.querySelectorAll('.sesja-czat-proba .ez2-kafelek.wl [data-strona="rozwiazanie"]').length === 2)
await pisz('Drugie: z nierówności trójkąta.')
if (process.env.SHOT_PISZ) await page.screenshot({ path: process.env.SHOT_PISZ })
await page.click(`${W} [data-strona="polecenie"]`)
check('„+ Zadanie" → kafelek-zadanie: polecenie i dwa rozwiązania', await czekaj((b) => {
  const s = b.nauka.find((j) => j.id === 's1')
  const c = b.concepts.find((x) => x.name === 'Moje zadanie')
  if (!c || !s.zadania.includes(c.id)) return false
  const v = b.versions.find((x) => x.id === c.currentVersionId)
  const r1 = b.subpages.find((x) => x.conceptId === c.id && x.name === 'Rozwiązanie')
  const r2 = b.subpages.find((x) => x.conceptId === c.id && x.name === 'Rozwiązanie 2')
  return c.mainPageName === 'Polecenie' && v?.content.includes('przecięcie') && r1?.content.includes('mniejszy promień') && r2?.content.includes('nierówności')
}))

// zadania z czatem
await page.click(`${E} [data-z-czatem]`)
await page.click(`${E} button:has-text("Tylko kopiuj")`)
await page.waitForTimeout(600)
const pol = await page.evaluate(() => navigator.clipboard.readText())
check('polecenie: zna wszystkie dotychczasowe zadania sektora', pol.includes('Stare zadanie: Pokaż, że kula jest otwarta.') && pol.includes('Moje zadanie: Udowodnij'))
check('polecenie: nie powtarzaj, wzór ZADANIE/TREŚĆ/ROZWIĄZANIE, materiał', pol.includes('NIE powtarzaj') && pol.includes('ZADANIE:') && pol.includes('ROZWIĄZANIE 2:') && pol.includes('Treść: Kula'))
check('polecenie: najpierw same zadania, rozwiązania dopiero po mojej próbie', pol.includes('SAME TREŚCI') && pol.includes('Bez rozwiązań') && pol.includes('Poczekaj, aż napiszę'))
await page.fill(`${E} textarea.ez-wklej`, 'Proszę:\n```\nZADANIE: Kula dyskretna\nTREŚĆ:\nOpisz kulę o promieniu 1/2.\nROZWIĄZANIE:\nTylko środek.\nROZWIĄZANIE 2:\nZ rysunku.\n---\nZADANIE: **Otwartość**\nTREŚĆ:\nCzy [0,1) jest otwarty?\nROZWIĄZANIE:\nNie.\n```')
await page.waitForSelector(`${E} .ez-od-czatu li`)
check('odczyt: 2 rozpoznane kafelki-zadania, zaznaczone', (await page.locator(`${E} .ez-od-czatu li`).count()) === 2 &&
  (await page.locator(`${E} .ez-od-czatu input:checked`).count()) === 2 && (await page.locator(`${E} .ez-od-czatu`).innerText()).includes('Otwartość'))
check('podgląd: polecenie i rozwiązania kafelka', (await page.locator(`${E} .ez-od-czatu li`).first().innerText()).includes('Opisz kulę') &&
  (await page.locator(`${E} .ez-od-czatu li`).first().innerText()).includes('Rozwiązanie 2'))
await page.locator(`${E} .ez-od-czatu input`).nth(1).uncheck()
await page.click(`${E} [data-dodaj-od-czatu]`)
check('dodane tylko zaznaczone, z dwoma rozwiązaniami', await czekaj((b) => {
  const s = b.nauka.find((j) => j.id === 's1')
  const c = b.concepts.find((x) => x.name === 'Kula dyskretna')
  return !!c && s.zadania.length === 3 && !b.concepts.some((x) => x.name === 'Otwartość') &&
    b.subpages.some((x) => x.conceptId === c.id && x.name === 'Rozwiązanie' && x.content === 'Tylko środek.') &&
    b.subpages.some((x) => x.conceptId === c.id && x.name === 'Rozwiązanie 2' && x.content === 'Z rysunku.')
}))
await page.waitForFunction(() => document.querySelectorAll('.sesja-czat-proba .ez2-poz').length === 3)
check('po dodaniu: nowe zadanie wybrane w kolumnie', (await page.locator(`${W} .ez2-tytul`).inputValue()) === 'Kula dyskretna')

// usunięcie strony z rozwiązaniem (po pytaniu)
await page.locator(`${W} [data-strona="rozwiazanie"]`).nth(1).click()
await page.click(`${W} .ez2-strona-usun`)
await page.click('.ask-dialog .btn-danger-strong')
check('usunięta strona „Rozwiązanie 2" (po pytaniu), zadanie zostaje', await czekaj((b) => {
  const c = b.concepts.find((x) => x.name === 'Kula dyskretna')
  return !!c && !b.subpages.some((x) => x.conceptId === c.id && x.name === 'Rozwiązanie 2') && b.subpages.some((x) => x.conceptId === c.id && x.name === 'Rozwiązanie')
}))

// źródła zadania: kafelek z biblioteki (i odpięcie), PDF obok w trybie podpinania
check('stopka kafelka: „Źródło z PDF" i „Kafelek jako źródło"', (await page.locator(`${W} .block-stopka [data-zrodlo-pdf]`).count()) === 1 &&
  (await page.locator(`${W} .block-stopka [data-zrodlo-kafelek]`).count()) === 1)
await page.click(`${W} [data-zrodlo-kafelek]`)
await page.fill('.picker-modal .picker-search', 'Otoczenie')
await page.click('.picker-modal .picker-item:has-text("Otoczenie")')
check('kafelek-źródło zapisany w zadaniu i widoczny w stopce', await czekaj((b) => {
  const c = b.concepts.find((x) => x.name === 'Kula dyskretna')
  const v = b.versions.find((x) => x.id === c?.currentVersionId)
  return !!v?.sourceRefs.some((r) => r.kind === 'block' && r.conceptId === 'c2')
}) && (await page.locator(`${W} .source-list`).innerText()).includes('Otoczenie'))
await page.hover(`${W} .source-list-item`)
await page.click(`${W} .source-odepnij`)
check('odpięcie źródła', await czekaj((b) => {
  const c = b.concepts.find((x) => x.name === 'Kula dyskretna')
  return b.versions.find((x) => x.id === c?.currentVersionId)?.sourceRefs.length === 0
}))
await page.click(`${W} [data-zrodlo-pdf]`)
await page.waitForSelector(`${E} .ez3-pdf .pdf-panel`)
check('„Źródło z PDF": PDF obok kolumny i podpowiedź, co zaznaczyć', (await page.locator(`${E} [data-podpinanie]`).innerText()).includes('Kula dyskretna') &&
  (await page.evaluate(() => { const k = document.querySelector('.ez3-kolumna').getBoundingClientRect(); const p = document.querySelector('.ez3-pdf').getBoundingClientRect(); return p.left >= k.right - 2 && k.width > 300 })))
await page.keyboard.press('Escape')
await page.waitForTimeout(150)
check('Esc kończy podpinanie, ekran zostaje', (await page.locator(`${E} [data-podpinanie]`).count()) === 0 && (await page.locator(`${E} .etap-zadan`).count()) === 1)
// wycinek PDF jako źródło zadania
await page.setInputFiles(`${E} .ez3-pdf input[type=file][accept="application/pdf"]`, 'scripts/test-multi.pdf')
await page.waitForSelector(`${E} .ez3-pdf .pdf-page-wrap canvas`)
await page.click(`${W} [data-zrodlo-pdf]`)
await page.waitForSelector(`${E} [data-podpinanie]`)
{
  const c = await page.locator(`${E} .ez3-pdf .pdf-page-wrap canvas`).first().boundingBox()
  await page.mouse.move(c.x + 40, c.y + 50)
  await page.mouse.down()
  await page.mouse.move(c.x + 260, c.y + 120, { steps: 5 })
  await page.mouse.up()
}
check('zaznaczony fragment PDF podpięty do zadania, w stopce „…, s. 1"', await czekaj((b) => {
  const c = b.concepts.find((x) => x.name === 'Kula dyskretna')
  const v = b.versions.find((x) => x.id === c?.currentVersionId)
  return !!v?.sourceRefs.some((r) => r.pdfId && r.page === 1)
}) && (await page.locator(`${W} .source-list`).innerText()).includes('s. 1') && (await page.locator(`${E} [data-podpinanie]`).count()) === 0)
if (process.env.SHOT_PDF) await page.screenshot({ path: process.env.SHOT_PDF })
await page.click(`${E} [data-pdf]`)

// usunięcie zadania
await page.click(`${E} .ez2-poz:has-text("Stare zadanie")`)
await page.click(`${W} .ez-usun`)
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

// --- zadanie dołożone po nauce: „Doucz nowe" ---
await page.waitForSelector(`${K} [data-zadania]`)
await page.click(`${K} [data-zadania]`)
await page.waitForSelector(`${E} [data-gotowe-zadania]`)
check('nauczony sektor: ekran zadań z „Gotowe" i informacją o douczaniu', (await page.locator(`${E} .ez-koniec`).innerText()).includes('Doucz nowe') &&
  (await page.locator(`${E} [data-test-koncowy]`).count()) === 0)
await page.click(`${E} [data-nowe-zadanie]`)
await page.waitForFunction(() => document.querySelectorAll('.sesja-czat-proba .ez2-poz').length === 3)
await page.locator(`${W} .ez2-tytul`).fill('Późne zadanie')
await page.click(`${E} [data-gotowe-zadania]`)
await page.waitForSelector(`${K} .karta-sektora-nowe`)
check('po nauce: nowe zadanie → „Doucz nowe (1)" przy sektorze', (await page.locator(`${K} .karta-sektora-nowe`).innerText()).includes('Doucz nowe (1)'))

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
await page.waitForSelector(`${W} .ez2-tytul`)
await page.locator(`${W} .ez2-tytul`).fill('Zadanie na niby')
await page.click(`${E} [data-z-czatem]`)
await page.click(`${E} .test-czatem-przyklady button`)
await page.click(`${E} [data-dodaj-od-czatu]`)
await page.waitForTimeout(300)
check('próba: zadania w pamięci (własne i od czatu)', (await page.locator(`${E} .ez2-poz`).count()) >= 3)
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
