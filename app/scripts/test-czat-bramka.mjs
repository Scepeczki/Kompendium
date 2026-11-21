// Test czatem: ocena łączna (gorsza z zakrytego i czatu), NIESPRAWDZONY,
// luki → wymagania kafelków, bramka (dalej dopiero przy ZALICZONE), dogrywki
// bez zmiany terminów, limit dogrywek → przemapowanie kafelków z NIE →
// krótki test → znowu dogrywka, „Nie zgadzam się z oceną", pominięcie czatu
// z kosztem (najbliższa powtórka z czatem), powtórka rozszerzona z czatem
// (łączenie ocen bez bramki) i dobrowolna dogrywka.
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
page.on('dialog', (d) => d.accept())
await page.goto('http://localhost:5173')
await page.waitForSelector('text=Kompendium')
await page.evaluate(() => {
  localStorage.setItem('ui.nauka.przerwa', '0')
  localStorage.setItem('ui.nauka.zadaniaWZero', '0')
  localStorage.removeItem('ui.nauka.polecenieTest')
  localStorage.removeItem('ui.nauka.polecenieDogrywka')
})

const baza = () =>
  page.evaluate(async () => {
    const req = indexedDB.open('kompendium')
    await new Promise((r) => (req.onsuccess = r))
    const db = req.result
    const wez = (t) => new Promise((r) => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess = () => r(q.result) })
    const out = { nauka: await wez('nauka'), pamiec: await wez('pamiec'), historia: (await wez('historia')).sort((a, b) => a.kiedy.localeCompare(b.kiedy)) }
    db.close()
    return out
  })
const sektor = async (id) => (await baza()).nauka.find((j) => j.id === id)
const pam = async (k) => (await baza()).pamiec.find((p) => p.klucz === k)
const doNauki = async () => {
  await page.reload()
  await page.waitForSelector('text=Kompendium')
  await page.waitForTimeout(400)
  await page.click('.path-item:has-text("Topologia")')
  await page.click('.view-switch button:has-text("Nauka")')
  await page.waitForSelector('.karta-sektora[data-sektor="s1"]')
}
/** Czeka, aż warunek na bazie będzie spełniony (zapisy są asynchroniczne). */
const czekaj = async (f, ms = 6000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await f(await baza())) return true
    await page.waitForTimeout(150)
  }
  return false
}

const minelo = new Date(Date.now() - 3600_000).toISOString()
await page.evaluate(async (minelo) => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const T = db.transaction(['concepts', 'versions', 'paths', 'nauka', 'pamiec', 'historia'], 'readwrite')
  const now = new Date().toISOString()
  const nodes = []
  for (const [id, n] of [['c1', 'Kula'], ['c2', 'Otoczenie'], ['c3', 'Zbiór domknięty'], ['c4', 'Lemat o kulach']]) {
    T.objectStore('concepts').put({ id, name: n, type: 'definicja', pathId: 'p', currentVersionId: 'v' + id, folderId: null, tags: [], createdAt: now, updatedAt: now, order: 1 })
    T.objectStore('versions').put({ id: 'v' + id, conceptId: id, version: 1, content: 'Treść: ' + n, sourceRefs: [], createdAt: now, updatedAt: now })
    nodes.push({ id: 'n' + id, kind: 'block', conceptId: id, versionId: null, subpageId: null, x: 0, y: nodes.length * 100 })
  }
  const edges = nodes.slice(1).map((n, i) => ({ id: 'e' + i, from: nodes[i].id, to: n.id }))
  T.objectStore('paths').put({ id: 'p', name: 'Topologia', folderId: null, order: 0, nodes, edges, createdAt: now, updatedAt: now })
  // sektor po mapowaniu, przerwa minęła
  T.objectStore('nauka').put({ id: 's1', rodzaj: 'sektor', pathId: 'p', nazwa: 'Kule', wezly: nodes.map((n) => n.id), kolor: '#5b8def', etap: 'przerwa', etapOd: minelo, powtorek: 0, ostatniaRozszerzona: 0, wymagania: { nc2: 'definicja i przykład' }, utworzono: now, zmieniono: now })
  await new Promise((r) => (T.oncomplete = r))
}, minelo)
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(500)

await page.click('.path-item:has-text("Topologia")')
await page.click('.view-switch button:has-text("Nauka")')
await page.waitForSelector('.karta-sektora[data-sektor="s1"]')

// ---------------------------------------------------------------------------
// 1. Test zakryty: wszystko Tak
await page.click('.karta-sektora[data-sektor="s1"] button:has-text("Zacznij test")')
await page.waitForSelector('.sesja-element')
const ile = await page.locator('.sesja-element').count()
for (let i = 0; i < ile; i++) {
  await page.locator('.sesja-element').nth(i).locator('button:has-text("Sprawdź")').click()
  await page.locator('.sesja-element').nth(i).locator('button:has-text("Tak")').click()
}
await page.click('.sesja-zapisz')
await page.waitForSelector('.sesja-wynik .test-czatem')
let d = await baza()
const przedC3 = d.pamiec.find((p) => p.klucz === 'c3')
check('po teście zakrytym: sektor czeka na czat', d.nauka.find((j) => j.id === 's1').etap === 'czat')
check('pamięć kafelka pamięta ocenę z testu (do obniżenia przez czat)', przedC3?.przed?.ocena === 3 && !przedC3.slaby)

// polecenie: NIESPRAWDZONY i luki przypisane do kafelków
await page.click('.sesja-wynik .test-czatem button:has-text("Tylko kopiuj")')
await page.click('.sesja-wynik .test-czatem-polecenie summary')
const polecenie = await page.locator('.sesja-wynik .test-czatem-polecenie textarea').inputValue()
check('polecenie: ocena NIESPRAWDZONY dla kafelków bez pytania', polecenie.includes('NIESPRAWDZONY') && polecenie.includes('nie padło żadne pytanie'))
check('polecenie: luki „- Nazwa kafelka: brak"', polecenie.includes('- Nazwa kafelka: jeden konkretny brak albo błąd'))
check('polecenie: wymagania kafelka w materiale', polecenie.includes('(Wymagania w teście: definicja i przykład)'))

// ---------------------------------------------------------------------------
// 2. Czat: Kula TAK, Otoczenie CZĘŚCIOWO, Zbiór domknięty NIE, Lemat NIESPRAWDZONY
const podsumowanie = (wynik, kafelki, luki = []) =>
  '```\nWYNIK: ' + wynik + '\nKAFELKI:\n' + kafelki.map((k) => `- ${k}`).join('\n') +
  '\nLUKI:\n' + (luki.length ? luki.map((l) => `- ${l}`).join('\n') : '- brak') + '\nKLUCZ:\n- Zbiór domknięty: dopełnienie otwarte.\n```'
const wklej = async (zakres, tekst) => {
  await page.locator(`${zakres} .test-czatem-wklej textarea`).fill(tekst)
  await page.waitForSelector(`${zakres} [data-zapisz-czat]`)
}
await wklej('.sesja-wynik', podsumowanie('NIEZALICZONE', [
  'Kula: TAK — dobrze.',
  'Otoczenie: CZĘŚCIOWO — bez przykładu.',
  'Zbiór domknięty: NIE — pomylony z otwartym.',
  'Lemat o kulach: NIESPRAWDZONY — nie było pytania.',
], ['Otoczenie: brak przykładu otoczenia punktu', 'Zbiór domknięty: opisany jak otwarty']))
check('odczyt: werdykt NIEZALICZONE', (await page.locator('.sesja-wynik .test-czatem-werdykt').getAttribute('data-werdykt')) === 'luki')
check('odczyt: NIESPRAWDZONY widać jako osobną ocenę', (await page.locator('.sesja-wynik .test-czatem-kafelki .zaznacz-niesprawdzony').count()) === 1)
check('odczyt: luka przypisana do kafelka', (await page.locator('.sesja-wynik li[data-kafelek="Otoczenie"] .test-czatem-luki-kafelka').innerText()).includes('brak przykładu'))
await page.click('.sesja-wynik [data-zapisz-czat]')
await czekaj((b) => !!b.nauka.find((j) => j.id === 's1').luki)
d = await baza()
let s1 = d.nauka.find((j) => j.id === 's1')
const c1 = d.pamiec.find((p) => p.klucz === 'c1')
const c2 = d.pamiec.find((p) => p.klucz === 'c2')
const c3 = d.pamiec.find((p) => p.klucz === 'c3')
const c4 = d.pamiec.find((p) => p.klucz === 'c4')
check('bramka: NIEZALICZONE → sektor zostaje na czacie', s1.etap === 'czat')
check('łącznie Tak+TAK → bez zmian', c1.przed.ocena === 3 && !c1.slaby)
check('łącznie Tak+CZĘŚCIOWO → Częściowo: słaby, krótszy termin', c2.przed.ocena === 2 && c2.slaby && c2.termin < przedC3.termin)
check('łącznie Tak+NIE → Nie: słaby, krótszy termin i „do poprawy"', c3.przed.ocena === 1 && c3.slaby && c3.termin < c2.termin && s1.doPoprawy?.includes('nc3'))
check('NIESPRAWDZONY → zostaje ocena z testu zakrytego', c4.przed.ocena === 3 && !c4.slaby && c4.termin === przedC3.termin)
check('luki → wymagania kafelków (Otoczenie, Zbiór domknięty)', s1.lukiKafelkow?.nc2?.[0]?.includes('brak przykładu') && s1.lukiKafelkow?.nc3?.length === 1 && !s1.lukiKafelkow?.nc1)
const wpis = d.historia.filter((h) => h.typ === 'czat').at(-1)
check('historia: zakryte, czat (z NIESPRAWDZONY), łącznie, luki', wpis?.zakryte?.c3 === 'tak' && wpis?.lacznie?.c3 === 'nie' && wpis?.lacznie?.c2 === 'czesciowo' &&
  wpis?.czatKafelki?.some((k) => k.ocena === 'niesprawdzony') && !!wpis?.luki && wpis?.dogrywka === 0)
check('skutki pokazane: tabela zakryty → czat → łącznie', (await page.locator('.sesja-wynik .test-czatem-skutki .test-czatem-tabela').count()) === 1)
const terminyPoCzacie = Object.fromEntries(d.pamiec.map((p) => [p.klucz, p.termin]))

// ---------------------------------------------------------------------------
// 3. Dogrywki — nie zmieniają terminów; limit 2 → przemapowanie
await page.click('.sesja-wynik button:has-text("Gotowe")')
await page.waitForSelector('.karta-sektora[data-sektor="s1"] .test-czatem-luki')
const K = '.karta-sektora[data-sektor="s1"]'
check('karta: luki, dogrywka i informacja o bramce', (await page.locator(`${K} .test-czatem-luki`).innerText()).includes('dopiero po zaliczonej dogrywce') &&
  (await page.locator(`${K} button:has-text("Dogrywka: kopiuj i otwórz")`).count()) === 1)
await page.click(`${K} button:has-text("Tylko kopiuj")`)
await page.click(`${K} .test-czatem-polecenie summary`)
const dogr = await page.locator(`${K} .test-czatem-polecenie textarea`).inputValue()
check('polecenie dogrywki: z aktualnych luk', dogr.includes('Zbiór domknięty: opisany jak otwarty') && dogr.includes('sprawdź TYLKO te luki'))
check('Pomiń czat niedostępny w dogrywce', (await page.locator(`${K} .test-czatem-pomin`).count()) === 0)

const nieudana = podsumowanie('NIEZALICZONE', ['Zbiór domknięty: NIE — nadal myli pojęcia.'], ['Zbiór domknięty: nadal myli z otwartym'])
await wklej(K, nieudana)
await page.click(`${K} [data-zapisz-czat]`)
check('dogrywka 1 nieudana → licznik 1, dalej czat', await czekaj((b) => b.nauka.find((j) => j.id === 's1').dogrywek === 1))
s1 = await sektor('s1')
check('kolejne podsumowanie zastępuje listę luk', s1.luki.includes('nadal myli') && !s1.luki.includes('brak przykładu'))
check('luki z dogrywki dopisane do wymagań', s1.lukiKafelkow.nc3.length === 2)
await page.waitForSelector(`${K} .test-czatem-licznik`)
await wklej(K, nieudana)
await page.click(`${K} [data-zapisz-czat]`)
check('dogrywka 2 nieudana → limit: przemapowanie samego kafelka z NIE', await czekaj((b) => !!b.nauka.find((j) => j.id === 's1').przemapowanie))
s1 = await sektor('s1')
check('przemapowanie: tylko Zbiór domknięty, etap czatu zostaje', JSON.stringify(s1.przemapowanie.wezly) === '["nc3"]' && s1.etap === 'czat')
d = await baza()
check('dogrywki nie zmieniły terminów kafelków', d.pamiec.every((p) => p.termin === terminyPoCzacie[p.klucz]))
check('historia: numer dogrywki', d.historia.filter((h) => h.typ === 'czat').at(-1)?.dogrywka === 2)

// przemapowanie → przerwa → krótki test
await page.waitForSelector(`${K} button:has-text("Skończyłem")`)
check('karta: „Limit dogrywek — przemapuj kafelki z NIE (1)"', (await page.locator(`${K} .karta-sektora-etap`).first().innerText()).includes('przemapuj kafelki z NIE (1)'))
await page.click(`${K} button:has-text("Skończyłem")`)
await page.waitForSelector(`${K} button:has-text("Krótki test")`)
await page.click(`${K} button:has-text("Krótki test")`)
await page.waitForSelector('.sesja-element')
check('krótki test: tylko kafelek z NIE, bez mapy', (await page.locator('.sesja-element').count()) === 1 &&
  (await page.locator('.sesja-rodzaj').textContent()) === 'Krótki test po przemapowaniu' && (await page.locator('.sesja-mapa-pamiec').count()) === 0)
check('krótki test: luki z czatu w wymaganiach', (await page.locator('.sesja-element .sesja-wymagania').innerText()).includes('z czatu:'))
await page.locator('.sesja-element button:has-text("Sprawdź")').click()
await page.locator('.sesja-element button:has-text("Tak")').click()
await page.click('.sesja-zapisz')
await page.waitForSelector('.sesja-wynik')
check('po krótkim teście: komunikat „znowu dogrywka"', (await page.locator('.sesja-wynik').innerText()).includes('znowu dogrywka'))
s1 = await sektor('s1')
d = await baza()
check('po krótkim teście: licznik od zera, przemapowanie zamknięte', !s1.przemapowanie && s1.dogrywek === 0 && s1.etap === 'czat')
check('Tak w teście zakrytym zamyka luki kafelka w wymaganiach', !s1.lukiKafelkow?.nc3 && !!s1.lukiKafelkow?.nc2)
check('krótki test nie zmienił terminów', d.pamiec.every((p) => p.termin === terminyPoCzacie[p.klucz]))
await page.click('.sesja-wynik button:has-text("Gotowe")')

// ---------------------------------------------------------------------------
// 4. „Nie zgadzam się z oceną" → uchyla NIE → ZALICZONE → sektor idzie dalej
await page.waitForSelector(`${K} .test-czatem-luki`)
await wklej(K, nieudana)
check('przed sprzeciwem: NIEZALICZONE', (await page.locator(`${K} .test-czatem-werdykt`).getAttribute('data-werdykt')) === 'luki')
await page.click(`${K} li[data-kafelek="Zbiór domknięty"] .test-czatem-nie-zgadzam`)
check('sprzeciw wymaga uzasadnienia', await page.locator(`${K} .test-czatem-sprzeciw-pole button:has-text("Uchyl ocenę")`).isDisabled())
await page.fill(`${K} .test-czatem-sprzeciw-pole input`, 'Odpowiedziałem dobrze, czat pomylił definicje.')
await page.click(`${K} .test-czatem-sprzeciw-pole button:has-text("Uchyl ocenę")`)
check('po sprzeciwie: ZALICZONE', (await page.locator(`${K} .test-czatem-werdykt`).getAttribute('data-werdykt')) === 'zaliczone')
await page.click(`${K} [data-zapisz-czat]`)
check('zaliczone → sektor idzie do powtórek', await czekaj((b) => b.nauka.find((j) => j.id === 's1').etap === 'powtorki'))
s1 = await sektor('s1')
d = await baza()
const ostatni = d.historia.filter((h) => h.typ === 'czat').at(-1)
check('sprzeciw z uzasadnieniem w historii', ostatni?.sprzeciwy?.[0]?.powod?.includes('pomylił') && ostatni?.czat === 'zaliczone')
check('po zaliczeniu: luki i licznik wyczyszczone, słabe kafelki zostają', !s1.luki && !s1.dogrywek && d.pamiec.find((p) => p.klucz === 'c3').slaby)
check('luki w wymaganiach zostają do Tak w teście (Otoczenie)', !!s1.lukiKafelkow?.nc2)

// ---------------------------------------------------------------------------
// 5. Pominięcie czatu: z kosztem — najbliższa powtórka z czatem
await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const t = db.transaction('nauka', 'readwrite')
  const st = t.objectStore('nauka')
  const g = st.get('s1')
  await new Promise((r) => (g.onsuccess = r))
  st.put({ ...g.result, id: 's2', nazwa: 'Kule bis', etap: 'czat', luki: undefined, lukiKafelkow: undefined, czatNastepnym: undefined })
  await new Promise((r) => (t.oncomplete = r))
  db.close()
})
await doNauki()
const K2 = '.karta-sektora[data-sektor="s2"]'
await page.waitForSelector(`${K2} .test-czatem-pomin`)
await page.click(`${K2} .test-czatem-pomin`)
check('pominięcie: sektor idzie dalej, najbliższa powtórka z czatem', await czekaj((b) => {
  const s = b.nauka.find((j) => j.id === 's2')
  return s.etap === 'powtorki' && s.czatNastepnym === true
}))
d = await baza()
check('pominięcie w historii', d.historia.some((h) => h.jednostkaId === 's2' && h.czat === 'pominiety'))

// ---------------------------------------------------------------------------
// 6. Powtórka rozszerzona z czatem: łączenie ocen, bez bramki
await page.click(`${K2} button:has-text("Powtórz teraz")`)
await page.waitForSelector('.sesja-element')
check('powtórka po pominięciu jest rozszerzona z czatem', (await page.locator('.sesja-rodzaj').textContent()) === 'Powtórka rozszerzona · test czatem')
const ile2 = await page.locator('.sesja-element').count()
for (let i = 0; i < ile2; i++) {
  await page.locator('.sesja-element').nth(i).locator('button:has-text("Sprawdź")').click()
  await page.locator('.sesja-element').nth(i).locator('button:has-text("Tak")').click()
}
const mapa = page.locator('.sesja-mapa-pamiec button:has-text("Tak")')
if (await mapa.count()) {
  const odkryj = page.locator('.sesja-mapa-pamiec button:has-text("Sprawdź")')
  if (await odkryj.count()) await odkryj.first().click()
  await mapa.first().click()
}
await wklej('.sesja-czat', podsumowanie('ZALICZONE', [
  'Kula: TAK — dobrze.',
  'Otoczenie: CZĘŚCIOWO — bez przykładu.',
  'Zbiór domknięty: TAK — dobrze.',
  'Lemat o kulach: NIESPRAWDZONY — nie było pytania.',
], ['Otoczenie: wciąż bez przykładu']))
check('rozszerzona: ZALICZONE mimo CZĘŚCIOWO', (await page.locator('.sesja-czat .test-czatem-werdykt').getAttribute('data-werdykt')) === 'zaliczone')
await page.click('.sesja-czat [data-zapisz-czat]')
await page.waitForSelector('.sesja-czat .test-czatem-zapisane')
check('rozszerzona: czat obniżył Otoczenie (widać w sesji)', (await page.locator('.sesja-czat').innerText()).includes('Czat obniżył ocenę: Otoczenie'))
check('rozszerzona: CZĘŚCIOWO od czatu zmienia podpowiedź oceny', (await page.locator('.sesja-ocena-btn.btn-active .sesja-ocena-nazwa').textContent()) === 'Trudno')
const przedRozsz = await pam('c2')
await page.click('.sesja-zapisz')
await page.waitForSelector('.sesja-wynik')
d = await baza()
const s2 = d.nauka.find((j) => j.id === 's2')
const w2 = d.historia.filter((h) => h.jednostkaId === 's2' && h.typ === 'powtorka').at(-1)
check('rozszerzona: kafelek obniżony przez czat jest słaby', d.pamiec.find((p) => p.klucz === 'c2').slaby && d.pamiec.find((p) => p.klucz === 'c2').przed.ocena === 2)
check('rozszerzona: historia z oceną zakrytą, czatem i łączną', w2?.zakryte?.c2 === 'tak' && w2?.lacznie?.c2 === 'czesciowo' && w2?.czatKafelki?.length === 4)
check('rozszerzona: luki do wymagań, „najbliższa z czatem" zużyte', s2.lukiKafelkow?.nc2?.some((l) => l.includes('wciąż bez przykładu')) && !s2.czatNastepnym)
check('rozszerzona: bez bramki — sektor ma nowy termin', s2.etap === 'powtorki' && s2.powtorek === 1)
await page.click('.sesja-wynik button:has-text("Gotowe")')

// ---------------------------------------------------------------------------
// 7. Dobrowolna dogrywka po rozszerzonej z lukami
await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const t = db.transaction('nauka', 'readwrite')
  const st = t.objectStore('nauka')
  const g = st.get('s2')
  await new Promise((r) => (g.onsuccess = r))
  st.put({ ...g.result, luki: '- Otoczenie: wciąż bez przykładu' })
  await new Promise((r) => (t.oncomplete = r))
  db.close()
})
await doNauki()
await page.waitForSelector(`${K2} details.karta-sektora-uwaga`)
await page.click(`${K2} details.karta-sektora-uwaga summary`)
check('dogrywka dobrowolna przy powtórkach', (await page.locator(`${K2} .test-czatem-luki`).innerText()).includes('dobrowolna'))
await wklej(K2, podsumowanie('ZALICZONE', ['Otoczenie: TAK — jest przykład.']))
await page.click(`${K2} [data-zapisz-czat]`)
check('dobrowolna dogrywka zaliczona → luki zamknięte, etap bez zmian', await czekaj((b) => {
  const s = b.nauka.find((j) => j.id === 's2')
  return !s.luki && s.etap === 'powtorki'
}))

// ---------------------------------------------------------------------------
// 8. Same luki bez wzoru → zapisane jako luki
await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const t = db.transaction('nauka', 'readwrite')
  const st = t.objectStore('nauka')
  const g = st.get('s2')
  await new Promise((r) => (g.onsuccess = r))
  st.put({ ...g.result, id: 's3', nazwa: 'Kule ter', etap: 'czat', luki: undefined, lukiKafelkow: undefined })
  await new Promise((r) => (t.oncomplete = r))
  db.close()
})
await doNauki()
const K3 = '.karta-sektora[data-sektor="s3"]'
await page.waitForSelector(`${K3} .test-czatem-wklej textarea`)
await wklej(K3, 'Nie umiesz rozróżnić zbioru otwartego i domkniętego.')
check('tekst bez wzoru → NIEZALICZONE (luki)', (await page.locator(`${K3} .test-czatem-werdykt`).getAttribute('data-werdykt')) === 'luki')
await page.click(`${K3} [data-zapisz-czat]`)
check('tekst bez wzoru zapisany jako luki', await czekaj((b) => (b.nauka.find((j) => j.id === 's3').luki ?? '').includes('rozróżnić')))

console.log(errors.length ? `Błędy konsoli:\n${errors.join('\n')}` : '✓ bez błędów konsoli')
await browser.close()
if (problems.length || errors.length) {
  console.log(`\n${problems.length} problem(ów)`)
  process.exit(1)
}
console.log('\nWszystko OK')
