// Nauka: sektor z zaznaczonych kafelków, mapa, powtórka zero (mapowanie →
// przerwa → test z pisaniem i odsłanianiem), termin FSRS, słaby kafelek,
// test czatem, zadania (czatem, pasek w Linii, test końcowy), fiszka, strona
// Powtórek z licznikiem, powtórki rozszerzone (czat → zadania → trudny tryb)
// i Ustawienia → Nauka.
import { chromium } from 'playwright'
import { potwierdz, podaj } from './lib.mjs'

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
const kontekst = await browser.newContext({ viewport: { width: 1500, height: 950 } })
await kontekst.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5173' })
// czat otwiera się w nowej karcie — w teście tylko zapamiętujemy adres
await kontekst.addInitScript(() => {
  window.__otwarte = []
  window.open = (u) => {
    window.__otwarte.push(String(u))
    return null
  }
})
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
    const wez = (t) =>
      new Promise((r) => {
        const q = db.transaction(t).objectStore(t).getAll()
        q.onsuccess = () => r(q.result)
      })
    const [nauka, pamiec, historia] = [await wez('nauka'), await wez('pamiec'), await wez('historia')]
    db.close()
    return { nauka, pamiec, historia }
  })
const zmienJednostke = (id, zmiany) =>
  page.evaluate(
    async ([id, zmiany]) => {
      const req = indexedDB.open('kompendium')
      await new Promise((r) => (req.onsuccess = r))
      const db = req.result
      const t = db.transaction('nauka', 'readwrite')
      const s = t.objectStore('nauka')
      const g = s.get(id)
      await new Promise((r) => (g.onsuccess = r))
      s.put({ ...g.result, ...zmiany })
      await new Promise((r) => (t.oncomplete = r))
      db.close()
    },
    [id, zmiany],
  )

// --- ścieżka z trzema kafelkami ---
await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const T = db.transaction(['concepts', 'versions', 'paths'], 'readwrite')
  const now = new Date().toISOString()
  const nodes = []
  const tresci = ['Zbiór otwarty to taki, który…', 'Przestrzeń metryczna to para (X, d)…', 'Ciąg Cauchy’ego…']
  const nazwy = ['Zbiór otwarty', 'Przestrzeń metryczna', 'Ciąg Cauchyego']
  for (let i = 0; i < 3; i++) {
    T.objectStore('concepts').put({ id: 'nc' + i, name: nazwy[i], type: 'definicja', currentVersionId: 'nv' + i, folderId: null, tags: [], createdAt: now, updatedAt: now, order: 300 + i })
    T.objectStore('versions').put({ id: 'nv' + i, conceptId: 'nc' + i, version: 1, content: tresci[i], sourceRefs: [], createdAt: now, updatedAt: now })
    nodes.push({ id: 'nn' + i, kind: 'block', conceptId: 'nc' + i, versionId: null, subpageId: null, x: 0, y: i * 200 })
  }
  const edges = nodes.slice(1).map((n, i) => ({ id: 'ne' + i, from: nodes[i].id, to: n.id }))
  T.objectStore('paths').put({ id: 'np', name: 'Topologia', folderId: null, order: 0, nodes, edges, createdAt: now, updatedAt: now })
  await new Promise((r) => (T.oncomplete = r))
})
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(600)
await page.click('.path-item:has-text("Topologia")')
await page.click('.view-switch button:has-text("Nauka")')
await page.waitForSelector('.panel-nauki')
check('widok Nauka ma panel obok Linii', await page.locator('.nauka-uklad .linear-view').isVisible())

// --- sektor z zaznaczonych ---
await page.locator('.linear-seg[data-seg="nn0"]').click({ position: { x: 240, y: 8 }, modifiers: ['Control'] })
await page.locator('.linear-seg[data-seg="nn1"]').click({ position: { x: 240, y: 8 }, modifiers: ['Control'] })
await page.waitForTimeout(200)
check('przycisk liczy zaznaczone', (await page.locator('.panel-nauki-akcje .btn-primary').innerText()).includes('(2)'))
await page.click('.panel-nauki-akcje .btn-primary')
await podaj(page, 'Podstawy')
await page.waitForTimeout(500)
let d = await baza()
const sektor = d.nauka.find((j) => j.rodzaj === 'sektor')
check('sektor powstaje z zaznaczonych węzłów', sektor?.nazwa === 'Podstawy' && sektor.wezly.join() === 'nn0,nn1', JSON.stringify(sektor?.wezly))
check('pasmo sektora w Linii', (await page.locator('.linear-seg[data-sektor]').count()) === 2)
check('nazwa sektora nad pierwszym kafelkiem', await page.locator('.linear-seg.sektor-poczatek .sektor-etykieta-nazwa:has-text("Podstawy")').isVisible())
check('mały sektor dostaje cichą uwagę', await page.locator('.karta-sektora-uwaga:has-text("Mały sektor")').isVisible())

// --- poza sektorami → fiszka ---
check('lista „poza sektorami" jest rozwinięta, gdy są sektory', (await page.locator('.sektory-poza[open]').count()) === 1)
const poza = page.locator('.sektory-poza li:has-text("Ciąg Cauchyego")')
check('kafelek poza sektorem jest na liście', (await poza.count()) === 1)
await poza.locator('button:has-text("Ucz się osobno")').click()
await page.waitForTimeout(400)
d = await baza()
check('„Ucz się osobno" robi fiszkę', d.nauka.some((j) => j.rodzaj === 'fiszka' && j.conceptId === 'nc2'))

// --- mapa ---
await page.click('.panel-nauki-zakladki button:has-text("Mapa")')
await page.waitForSelector('.mapa-sektora .tiptap')
await page.click('.mapa-sektora .tiptap')
await page.keyboard.type('Metryka → kule → zbiory otwarte')
await page.waitForTimeout(900)
d = await baza()
check('mapa zapisuje się w sektorze', (d.nauka.find((j) => j.id === sektor.id)?.mapa ?? '').includes('kule'))

// --- powtórka zero ---
await page.click('.panel-nauki-zakladki button:has-text("Sektory")')
await page.click('.karta-sektora button:has-text("Zacznij naukę")')
await page.waitForSelector('.ask-dialog')
check('przed nauką uprzedza o czasie', (await page.locator('.ask-dialog').innerText()).includes('przerwę'))
await potwierdz(page)
await page.waitForTimeout(400)
check('po starcie mapowanie i mapa', (await baza()).nauka.find((j) => j.id === sektor.id)?.etap === 'mapowanie')
await page.click('.panel-nauki-zakladki button:has-text("Sektory")')
await page.click('.karta-sektora button:has-text("Skończyłem mapowanie")')
await page.waitForTimeout(400)
check('przerwa blokuje test', await page.locator('.karta-sektora-przerwa:has-text("test za")').isVisible())
// przerwa minęła
await zmienJednostke(sektor.id, { etapOd: new Date(Date.now() - 21 * 60000).toISOString() })
// zmiana z boku bazy — aplikacja zobaczy ją po odświeżeniu
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.click('.path-item:has-text("Topologia")')
await page.waitForSelector('.panel-nauki')
await page.waitForSelector('.karta-sektora button:has-text("Zacznij test")', { timeout: 20000 })
check('po przerwie test jest gotowy', true)
await page.click('.karta-sektora button:has-text("Zacznij test")')
await page.waitForSelector('.sesja')
await page.waitForSelector('.sesja-rodzaj')
check('sesja: test po mapowaniu', (await page.locator('.sesja-rodzaj').textContent()).includes('Test po mapowaniu'), await page.locator('.sesja-rodzaj').textContent())
check('sesja: pytania i pole na mapę z pamięci', (await page.locator('.sesja-mapa-pamiec .sesja-pytania li').count()) > 3)
check('kafelki są zakryte', (await page.locator('.sesja-element:not(.odkryty)').count()) === 2 && (await page.locator('.sesja-element .block-content, .sesja-element .markdown-body').count()) === 0)
await page.fill('.sesja-mapa-pamiec textarea', 'metryka, kule, otwarte')
const el0 = page.locator('.sesja-element').nth(0)
await el0.locator('textarea').fill('zbiór, który z każdym punktem zawiera kulę')
await el0.locator('button:has-text("Sprawdź")').click()
check('„Sprawdź" odsłania treść i twoją odpowiedź', (await el0.innerText()).includes('Zbiór otwarty to taki') && (await el0.innerText()).includes('z każdym punktem'))
await el0.locator('button:has-text("Tak")').click()
const el1 = page.locator('.sesja-element').nth(1)
await el1.locator('button:has-text("Podejrzyj")').click()
check('podejrzenie liczy się jako „Nie" i jest zablokowane',
  (await el1.locator('.zaznacz-nie.btn-active').count()) === 1 && (await el1.locator('.zaznacz-tak').isDisabled()))
await page.click('button:has-text("Odkryj mapę")')
check('mapa odkrywa się na końcu', (await page.locator('.sesja-mapa').innerText()).includes('kule'))
await page.click('.sesja-mapa-porownaj .zaznacz-tak')
const podp = await page.locator('.sesja-ocena-btn.btn-active .sesja-ocena-nazwa').innerText()
check('podpowiedź oceny z zaznaczeń (1 z 2 nie poszedł → Trudno)', podp === 'Trudno', podp)
await page.click('.sesja-zapisz')
await page.waitForSelector('.sesja-wynik')
const wynik = await page.locator('.sesja-wynik').innerText()
check('po zapisie: dalej test czatem i słaby kafelek', wynik.includes('test czatem') && wynik.includes('Słabe kafelki: 1'), wynik.slice(0, 160))
d = await baza()
check('po teście sektor czeka na czat (z kartą FSRS)', d.nauka.find((j) => j.id === sektor.id)?.etap === 'czat' && !!d.nauka.find((j) => j.id === sektor.id)?.karta)

// --- test czatem w powtórce zero ---
await page.click('.sesja-wynik .test-czatem-krok .btn-primary')
await page.waitForTimeout(600)
const polecenieCzatu = await page.evaluate(() => navigator.clipboard.readText())
check('polecenie czatu w schowku: zasady, pytania i materiał',
  polecenieCzatu.includes('egzaminatorem') && polecenieCzatu.includes('Jakie są konsekwencje definicji') &&
    polecenieCzatu.includes('Zbiór otwarty to taki') && polecenieCzatu.includes('Metryka → kule'),
  polecenieCzatu.slice(0, 60))
check('otwiera wybrany czat (domyślnie Gemini)', (await page.evaluate(() => window.__otwarte.at(-1))) === 'https://gemini.google.com/app')
await page.click('.sesja-wynik .test-czatem-wynik button:has-text("Są luki")')
await page.fill('.sesja-wynik .test-czatem-wklej textarea', 'Dobrze ci poszło.\nWYNIK: NIEZALICZONE\nLUKI:\n- brak przykładu kuli\n- myli kulę z otoczeniem')
await page.click('.sesja-wynik .test-czatem-wklej button:has-text("Zapisz luki")')
await page.waitForTimeout(500)
d = await baza()
const poCzacie = d.nauka.find((j) => j.id === sektor.id)
check('luki z czatu zapisane, sektor dalej w czacie', poCzacie.etap === 'czat' && poCzacie.luki?.startsWith('- brak przykładu') && !poCzacie.luki.includes('WYNIK'), poCzacie.luki)
check('dogrywka: przycisk i lista luk', (await page.locator('.sesja-wynik .test-czatem-krok .btn-primary').innerText()).startsWith('Dogrywka') &&
  (await page.locator('.sesja-wynik .test-czatem-luki').innerText()).includes('myli kulę'))
await page.click('.sesja-wynik .test-czatem-krok .btn-primary')
await page.waitForTimeout(500)
const dogrywka = await page.evaluate(() => navigator.clipboard.readText())
check('polecenie dogrywki ma tylko luki', dogrywka.includes('TYLKO te luki') && dogrywka.includes('myli kulę z otoczeniem'))
await page.click('.sesja-wynik .test-czatem-wynik button:has-text("Zaliczone")')
await page.waitForTimeout(500)
check('zaliczona dogrywka prowadzi do zadań', (await page.locator('.sesja-wynik').innerText()).includes('Teraz zadania'))
d = await baza()
const poCzacieZero = d.nauka.find((j) => j.id === sektor.id)
check('sektor czeka na zadania (z kartą FSRS, bez luk)', poCzacieZero.etap === 'zadania' && !!poCzacieZero.karta && poCzacieZero.termin > new Date().toISOString() && !poCzacieZero.luki)
check('historia czatu: luki, potem zaliczone', d.historia.filter((h) => h.typ === 'czat').sort((a, b) => a.kiedy.localeCompare(b.kiedy)).map((h) => h.czat).join() === 'luki,zaliczone')
check('pamięć kafelków: jeden słaby', d.pamiec.length === 2 && d.pamiec.filter((p) => p.slaby).length === 1 && d.pamiec.find((p) => p.slaby)?.klucz === 'nc1')
check('historia ma wpis testu z odpowiedziami', d.historia.filter((h) => h.typ === 'test').length === 1 && d.historia.find((h) => h.typ === 'test').odpowiedzi?.nc0?.includes('kulę'))
await page.click('.sesja-wynik button:has-text("Gotowe")')

// --- zadania: wygeneruj czatem ---
await page.waitForSelector('.karta-sektora .zadania-sektora')
check('test końcowy zablokowany bez zadań', await page.locator('.karta-sektora button:has-text("Test końcowy")').isDisabled())
await page.click('.zadania-sektora button:has-text("Wygeneruj czatem")')
await page.click('.zadania-generuj .btn-primary')
await page.waitForTimeout(500)
const polecenieZadan = await page.evaluate(() => navigator.clipboard.readText())
check('polecenie zadań: format, tok rozumowania i materiał', polecenieZadan.includes('=== ZADANIE:') && polecenieZadan.includes('tokiem rozumowania') &&
  polecenieZadan.includes('Ułóż 3 zadań') && polecenieZadan.includes('Metryka → kule'), polecenieZadan.slice(0, 80))
await page.fill('.zadania-generuj textarea.sesja-pole', `Oto zadania:

**=== ZADANIE: Kula w metryce dyskretnej**
**TREŚĆ:**
Opisz kulę $B(x,1)$ w metryce dyskretnej.
**ROZWIĄZANIE:**
Kula to sam punkt.
**METODA:**
Wypisz definicję kuli i podstaw metrykę.

=== ZADANIE: Otwartość przedziału
TREŚĆ:
Czy przedział [0,1) jest otwarty?
ROZWIĄZANIE:
Nie — punkt 0.
METODA:
Szukaj punktu, którego żadna kula nie mieści się w zbiorze.`)
check('podgląd rozpoznaje 2 zadania', (await page.locator('.zadania-podglad li').count()) === 2 &&
  (await page.locator('.zadania-generuj button:has-text("Utwórz zadania (2)")').count()) === 1)
await page.click('.zadania-generuj button:has-text("Utwórz zadania")')
await page.waitForTimeout(600)
const zBazy = await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const wez = (t) => new Promise((r) => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess = () => r(q.result) })
  const [c, v, sp, n] = [await wez('concepts'), await wez('versions'), await wez('subpages'), await wez('nauka')]
  db.close()
  return { c, v, sp, n }
})
const sekZ = zBazy.n.find((j) => j.id === sektor.id)
const zadK = (sekZ.zadania ?? []).map((id) => zBazy.c.find((c) => c.id === id))
check('dwa kafelki-zadania w folderze ścieżki, przypięte do sektora', zadK.length === 2 && zadK.every((c) => c?.type === 'zadanie' && c.pathId === 'np') &&
  zadK[0].name === 'Kula w metryce dyskretnej', zadK.map((c) => c?.name).join())
const stronyK = zBazy.sp.filter((x) => x.conceptId === zadK[0]?.id).sort((a, b) => a.order - b.order).map((x) => x.name).join()
check('zadanie ma treść i stronę Rozwiązanie (metoda czatu dopisana do niej)', stronyK === 'Rozwiązanie' &&
  zBazy.v.find((v) => v.conceptId === zadK[0]?.id)?.content.includes('Opisz kulę') &&
  zBazy.sp.find((x) => x.conceptId === zadK[0]?.id && x.name === 'Rozwiązanie')?.content.includes('podstaw metrykę'), stronyK)
check('zadania nie są węzłami ścieżki', !(await page.evaluate(async () => {
  const req = indexedDB.open('kompendium'); await new Promise((r) => (req.onsuccess = r))
  const q = req.result.transaction('paths').objectStore('paths').get('np'); await new Promise((r) => (q.onsuccess = r))
  req.result.close()
  return JSON.stringify(q.result.nodes)
})).includes('Kula'))

// --- pasek „Zadania" w Linii, nie w Skrypcie ---
const pasek = page.locator('.linear-seg[data-seg="nn1"] .zadania-pasek')
check('pasek „Zadania (2)" na końcu sektora, zwinięty', (await pasek.count()) === 1 && (await pasek.innerText()).includes('Zadania (2)') &&
  (await pasek.locator('.script-block').count()) === 0)
check('tylko w ostatnim segmencie sektora', (await page.locator('.zadania-pasek').count()) === 1)
await pasek.locator('.zadania-pasek-glowa').click()
await page.waitForTimeout(400)
check('rozwinięty pasek pokazuje zadania', (await pasek.locator('.script-block').count()) === 2)
check('klik w pasek nie zaznacza kafelka', (await page.locator('.linear-seg.zaznaczony').count()) === 0)
await page.click('.view-switch button:has-text("Skrypt")')
await page.waitForTimeout(500)
check('Skrypt bez zadań', (await page.locator('.zadania-pasek').count()) === 0 && !(await page.locator('.script-body').innerText()).includes('Kula w metryce'))
await page.click('.view-switch button:has-text("Nauka")')
await page.waitForSelector('.panel-nauki')

// --- Nauka: Linia tylko do czytania, sektor z prawego przycisku i klikaniem ---
check('w Nauce nie ma pisania ani „Dołóż"', (await page.locator('.nauka-uklad .linear-seg .inline-title').count()) === 0 &&
  !(await page.locator('.nauka-uklad .linear-append').isVisible()))
await page.locator('.linear-seg[data-seg="nn2"] .linear-content').click({ button: 'right' })
await page.waitForSelector('.menu-nauki')
check('prawy przycisk: menu nauki zamiast wstawiania', (await page.locator('.menu-nauki').innerText()).includes('Dodaj do „Podstawy"') &&
  (await page.locator('.linear-menu:has-text("Notatka")').count()) === 0)
await page.click(".menu-nauki button:has-text('Dodaj do „Podstawy')")
await page.waitForTimeout(400)
d = await baza()
check('„Dodaj do sektora" z prawego przycisku', d.nauka.find((j) => j.id === sektor.id).wezly.join() === 'nn0,nn1,nn2')
await page.locator('.linear-seg[data-seg="nn2"] .linear-content').click({ button: 'right' })
await page.click(".menu-nauki button:has-text('Wyjmij z „Podstawy')")
await page.waitForTimeout(400)
d = await baza()
check('„Wyjmij z sektora" z prawego przycisku', d.nauka.find((j) => j.id === sektor.id).wezly.join() === 'nn0,nn1')
await page.click('.karta-sektora[data-sektor="' + sektor.id + '"] button:has-text("Wybierz kafelki")')
await page.locator('.linear-seg[data-seg="nn2"] .linear-content').click()
await page.waitForTimeout(400)
d = await baza()
check('wybieranie: klik dokłada kafelek', d.nauka.find((j) => j.id === sektor.id).wezly.includes('nn2'))
await page.locator('.linear-seg[data-seg="nn2"] .linear-content').click()
await page.waitForTimeout(400)
d = await baza()
check('wybieranie: drugi klik wyjmuje', d.nauka.find((j) => j.id === sektor.id).wezly.join() === 'nn0,nn1')
await page.click('.wybieranie-pasek button:has-text("Gotowe")')
check('po „Gotowe" klik już nic nie zmienia', (await page.locator('.linear-view.wybieranie-sektora').count()) === 0)
await page.click('.panel-nauki-akcje button:has-text("Nowy pusty sektor")')
await podaj(page, 'Pusty')
await page.waitForTimeout(400)
check('pusty sektor od razu w trybie wybierania', (await page.locator('.wybieranie-pasek:has-text("Pusty")').count()) === 1)
await page.click('.wybieranie-pasek button:has-text("Gotowe")')
d = await baza()
check('pusty sektor zapisany', d.nauka.some((j) => j.nazwa === 'Pusty' && j.wezly.length === 0))

// --- test końcowy: najpierw nie wychodzi ---
await page.click('.karta-sektora button:has-text("Test końcowy")')
await page.waitForSelector('.sesja-element')
check('test końcowy: kafelki i zadania', (await page.locator('.sesja-rodzaj').textContent()) === 'Test końcowy' &&
  (await page.locator('.sesja-element').count()) === 4 && (await page.locator('.sesja-element-zadanie').count()) === 2)
check('treść zadania widać przed odsłonięciem', (await page.locator('.sesja-element-zadanie').first().innerText()).includes('Opisz kulę') &&
  !(await page.locator('.sesja-element-zadanie').first().innerText()).includes('podstaw metrykę'))
for (let i = 0; i < 4; i++) await page.locator('.sesja-element').nth(i).locator('button:has-text("Podejrzyj")').click()
await page.click('button:has-text("Odkryj mapę")')
await page.click('.sesja-mapa-porownaj .zaznacz-nie')
check('niezaliczony: podpowiedź „Do poprawy"', (await page.locator('.sesja-ocena-btn.btn-active .sesja-ocena-nazwa').innerText()) === 'Do poprawy')
await page.click('.sesja-zapisz')
await page.waitForSelector('.sesja-wynik')
d = await baza()
const poZlym = d.nauka.find((j) => j.id === sektor.id)
check('nieudany test końcowy: zostaje przy zadaniach, do poprawy kafelki i zadania', poZlym.etap === 'zadania' &&
  poZlym.doPoprawy?.length === 4 && poZlym.doPoprawy.includes(zadK[0].id) && poZlym.termin === poCzacieZero.termin)
await page.click('.sesja-wynik button:has-text("Gotowe")')
await page.waitForSelector('.karta-sektora')
check('zadanie do poprawy zaznaczone w panelu', (await page.locator('.zadania-lista .do-poprawy').count()) === 2)

// --- test końcowy jeszcze raz: zaliczony ---
await page.click('.karta-sektora button:has-text("Test końcowy")')
await page.waitForSelector('.sesja-element')
for (let i = 0; i < 2; i++) {
  await page.locator('.sesja-element').nth(i).locator('button:has-text("Sprawdź")').click()
  await page.locator('.sesja-element').nth(i).locator('button:has-text("Tak")').click()
}
const z1 = page.locator('.sesja-element-zadanie').first()
await z1.locator('textarea').fill('Definicja kuli, potem metryka dyskretna')
await z1.locator('button:has-text("Sprawdź")').click()
check('odsłonięte zadanie: rozwiązanie', (await z1.locator('.sesja-rozwiazanie .block-page.active').innerText()) === 'Rozwiązanie' &&
  (await z1.locator('.sesja-rozwiazanie').innerText()).includes('podstaw metrykę'))
await z1.locator('button:has-text("Tak")').click()
const z2 = page.locator('.sesja-element-zadanie').nth(1)
await z2.locator('button:has-text("Sprawdź")').click()
await z2.locator('button:has-text("Częściowo")').click()
await page.click('button:has-text("Odkryj mapę")')
await page.click('.sesja-mapa-porownaj .zaznacz-tak')
check('zaliczony: podpowiedź „Zaliczony"', (await page.locator('.sesja-ocena-btn.btn-active .sesja-ocena-nazwa').innerText()) === 'Zaliczony')
await page.click('.sesja-zapisz')
await page.waitForSelector('.sesja-wynik')
check('test końcowy kończy powtórkę zero', (await page.locator('.sesja-wynik').innerText()).includes('Test końcowy zaliczony'))
d = await baza()
const s2 = d.nauka.find((j) => j.id === sektor.id)
check('sektor w powtórkach, termin z pierwszego testu bez zmian', s2.etap === 'powtorki' && !s2.doPoprawy && s2.termin === poCzacieZero.termin && !!s2.karta)
check('historia: dwa testy końcowe, pamięć bez zadań', d.historia.filter((h) => h.typ === 'koncowy').length === 2 &&
  d.pamiec.length === 2 && !d.pamiec.some((p) => p.klucz.startsWith('zadanie:')))
await page.click('.sesja-wynik button:has-text("Gotowe")')

// --- Powtórki ---
await page.waitForTimeout(500)
check('licznik powtórek na dziś (fiszka)', (await page.locator('.licznik-powtorek').innerText()) === '1')
await page.click('.sidebar-powtorki')
await page.waitForSelector('.powtorki')
check('Powtórki: na dziś fiszka', (await page.locator('.powtorki-pozycja:has-text("Ciąg Cauchyego")').count()) === 1)
check('Powtórki: jutro słaby kafelek', (await page.locator('.powtorki-jutro summary').innerText()).startsWith('Jutro: 1'))
await page.click('.powtorki-pozycja:has-text("Ciąg Cauchyego") button:has-text("Zacznij")')
await page.waitForSelector('.sesja-element')
await page.click('.sesja-element button:has-text("Sprawdź")')
await page.click('.sesja-element button:has-text("Tak")')
await page.click('.sesja-zapisz')
await page.waitForSelector('.sesja-wynik')
await page.click('.sesja-wynik button:has-text("Gotowe")')
await page.waitForTimeout(500)
check('po fiszce licznik znika', (await page.locator('.licznik-powtorek').count()) === 0)

// --- powtórka rozszerzona: najpierw czat ---
const zalegly = {
  termin: new Date(Date.now() - 86400000).toISOString(),
  karta: { ...s2.karta, due: new Date(Date.now() - 86400000).toISOString() },
  powtorek: 2,
  ostatniaRozszerzona: 0,
}
await zmienJednostke(sektor.id, zalegly)
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(600)
await page.click('.sidebar-powtorki')
await page.click('.powtorki-pozycja[data-rodzaj="sektor"]:has-text("Podstawy") button:has-text("Zacznij")')
await page.waitForSelector('.sesja-element')
check('pierwsza rozszerzona to test czatem', (await page.locator('.sesja-rodzaj').textContent()).includes('czatem') &&
  (await page.locator('.sesja-czat').count()) === 1)
for (let i = 0; i < 2; i++) {
  await page.locator('.sesja-element').nth(i).locator('button:has-text("Sprawdź")').click()
  await page.locator('.sesja-element').nth(i).locator('button:has-text("Tak")').click()
}
await page.click('button:has-text("Odkryj mapę")')
await page.click('.sesja-mapa-porownaj .zaznacz-tak')
check('ocena czeka na wynik czatu', (await page.locator('.sesja-zapisz').count()) === 0)
await page.click('.sesja-czat button:has-text("Są luki")')
await page.fill('.sesja-czat .test-czatem-wklej textarea', '- zapomniał o symetrii')
await page.click('.sesja-czat button:has-text("Zapisz luki")')
const podpCzat = await page.locator('.sesja-ocena-btn.btn-active .sesja-ocena-nazwa').innerText()
check('luki w czacie obniżają podpowiedź do „Trudno"', podpCzat === 'Trudno', podpCzat)
await page.click('.sesja-zapisz')
await page.waitForSelector('.sesja-wynik')
d = await baza()
const s3 = d.nauka.find((j) => j.id === sektor.id)
check('rozszerzona policzona, luki przy sektorze', s3.rozszerzonych === 1 && s3.ostatniaRozszerzona === 3 && s3.luki === '- zapomniał o symetrii')
await page.click('.sesja-wynik button:has-text("Gotowe")')

// --- następna rozszerzona: zadania ---
await zmienJednostke(sektor.id, { ...zalegly, karta: { ...s3.karta, due: zalegly.termin }, powtorek: 5, ostatniaRozszerzona: 3, rozszerzonych: 1 })
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(600)
await page.click('.sidebar-powtorki')
await page.click('.powtorki-pozycja[data-rodzaj="sektor"]:has-text("Podstawy") button:has-text("Zacznij")')
await page.waitForSelector('.sesja-element')
check('druga rozszerzona: zadania (sektor je ma)', (await page.locator('.sesja-rodzaj').textContent()).includes('zadania') &&
  (await page.locator('.sesja-element-zadanie').count()) === 2 && (await page.locator('.sesja-czat').count()) === 0)
await page.click('.sesja .btn:has-text("Wróć")')

// --- trzecia rozszerzona: trudny tryb ---
await zmienJednostke(sektor.id, { ...zalegly, karta: { ...s3.karta, due: zalegly.termin }, powtorek: 5, ostatniaRozszerzona: 3, rozszerzonych: 2 })
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(600)
await page.click('.sidebar-powtorki')
await page.waitForSelector('.powtorki-pozycja[data-rodzaj="sektor"]:has-text("Podstawy")')
const poz = page.locator('.powtorki-pozycja[data-rodzaj="sektor"]:has-text("Podstawy")')
check('zaległy sektor z napisem „rozszerzona"', (await poz.innerText()).includes('rozszerzona') && (await poz.innerText()).includes('zaległe'))
await poz.locator('button:has-text("Zacznij")').click()
await page.waitForSelector('.sesja')
check('trudny tryb: nazwy kafelków zakryte, bez zadań', (await page.locator('.sesja-rodzaj').textContent()).includes('trudny') &&
  (await page.locator('.sesja-nazwa:has-text("Co tu stoi?")').count()) === 2 && (await page.locator('.sesja-element-zadanie').count()) === 0)
await page.click('.sesja .btn:has-text("Wróć")')

// --- Ustawienia → Nauka ---
await page.click('.sidebar-foot-btn[title="Ustawienia"]')
await page.click('.settings-nav-item:has-text("Nauka")')
await page.waitForSelector('[data-nauka="cel"]')
check('Ustawienia: cel zapamiętania domyślnie 95%', (await page.locator('[data-nauka="cel"] input').inputValue()) === '95')
await page.fill('[data-nauka="cel"] input', '97')
await page.waitForTimeout(200)
check('Ustawienia: zmiana celu zapisuje się', (await page.evaluate(() => localStorage.getItem('ui.nauka.cel'))) === '97')
check('Ustawienia: zadania w powtórce zero i polecenie zadań', (await page.locator('.settings-check:has-text("Zadania w powtórce zero") input').isChecked()) &&
  (await page.locator('[data-nauka="zadanIle"] input').inputValue()) === '3' &&
  (await page.locator('textarea[aria-label="Polecenie: ułóż zadania"]').inputValue()).includes('=== ZADANIE:'))
check('Ustawienia: pytania nauki do edycji', (await page.locator('.settings-textarea').first().inputValue()).includes('sens'))

console.log('')
console.log(`BŁĘDY KONSOLI: ${errors.length === 0 ? 'brak' : errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`   ${e.slice(0, 200)}`)
console.log(problems.length === 0 ? '>>> WSZYSTKO POPRAWNE' : `>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`)
await browser.close()
if (problems.length || errors.length) process.exit(1)
