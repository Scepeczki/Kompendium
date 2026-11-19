// Tryb mapowania: okno na cały ekran ze źródłem obok mapy kafelka, mapą
// sektora, przeglądem, ściągą pod żarówką, podglądem ścieżki i biblioteki,
// przerwaniem i powrotem. Do tego: zwykła Linia nie pokazuje pasm sektorów.
// Zrzuty ekranu idą do folderu z argumentu (domyślnie bieżący).
import { chromium } from 'playwright'
import { potwierdz } from './lib.mjs'

const zrzuty = process.argv[2] ?? '.'
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
const kontekst = await browser.newContext({ viewport: { width: 1500, height: 950 } })
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
    const q = db.transaction('nauka').objectStore('nauka').getAll()
    await new Promise((r) => (q.onsuccess = r))
    db.close()
    return q.result
  })

// --- dwie ścieżki: Algebra (3 kafelki, jeden ze stroną „Dowód") i Analiza ---
await page.evaluate(async () => {
  const req = indexedDB.open('kompendium')
  await new Promise((r) => (req.onsuccess = r))
  const db = req.result
  const T = db.transaction(['concepts', 'versions', 'paths', 'subpages', 'nauka'], 'readwrite')
  const now = new Date().toISOString()
  const kafelek = (i, nazwa, tresc) => {
    T.objectStore('concepts').put({ id: 'mc' + i, name: nazwa, type: 'definicja', currentVersionId: 'mv' + i, folderId: null, tags: [], createdAt: now, updatedAt: now, order: 500 + i })
    T.objectStore('versions').put({ id: 'mv' + i, conceptId: 'mc' + i, version: 1, content: tresc, sourceRefs: [], createdAt: now, updatedAt: now })
  }
  kafelek(0, 'Podzielność', 'Liczba całkowita $n$ **dzieli** $m$, jeśli istnieje $k$ takie, że $m = nk$.')
  kafelek(1, 'Liczba pierwsza', 'Liczba pierwsza ma dokładnie dwa dzielniki.')
  kafelek(2, 'NWD', 'Największy wspólny dzielnik dwóch liczb.')
  kafelek(3, 'Granica ciągu', 'Ciąg ma granicę $g$, jeśli prawie wszystkie wyrazy są blisko $g$.')
  T.objectStore('subpages').put({ id: 'ms0', conceptId: 'mc0', versionId: 'mv0', name: 'Dowód', content: 'Dowód: z definicji iloczynu.', order: 0, createdAt: now, updatedAt: now })
  const nodes = [
    { id: 'mh', kind: 'heading', text: 'Teoria liczb', level: 1, x: 0, y: 0 },
    ...[0, 1, 2].map((i) => ({ id: 'mn' + i, kind: 'block', conceptId: 'mc' + i, versionId: null, subpageId: null, x: 0, y: (i + 1) * 200 })),
  ]
  const edges = nodes.slice(1).map((n, i) => ({ id: 'me' + i, from: nodes[i].id, to: n.id }))
  T.objectStore('paths').put({ id: 'mp', name: 'Algebra', folderId: null, order: 0, nodes, edges, createdAt: now, updatedAt: now })
  T.objectStore('paths').put({ id: 'mp2', name: 'Analiza', folderId: null, order: 1, nodes: [{ id: 'an0', kind: 'block', conceptId: 'mc3', versionId: null, subpageId: null, x: 0, y: 0 }], edges: [], createdAt: now, updatedAt: now })
  T.objectStore('nauka').put({ id: 'ms', rodzaj: 'sektor', pathId: 'mp', nazwa: 'Podzielność', wezly: ['mn0', 'mn1'], kolor: '#e07a5f', etap: 'nowy', powtorek: 0, ostatniaRozszerzona: 0, utworzono: now, zmieniono: now })
  await new Promise((r) => (T.oncomplete = r))
})
await page.reload()
await page.waitForSelector('text=Kompendium')
await page.waitForTimeout(600)
await page.click('.path-item:has-text("Algebra")')

// --- zwykła Linia: bez pasm sektorów ---
await page.click('.view-switch button:has-text("Linia")')
await page.waitForSelector('.linear-seg[data-seg="mn0"]')
check('zwykła Linia nie pokazuje pasm sektorów', (await page.locator('.linear-view .sektor-pasmo').count()) === 0)

// --- start nauki otwiera tryb mapowania ---
await page.click('.view-switch button:has-text("Nauka")')
await page.waitForSelector('.panel-nauki')
await page.click('.karta-sektora button:has-text("Zacznij naukę")')
await potwierdz(page)
await page.waitForSelector('.tm')
check('tryb mapowania na cały ekran', await page.locator('.tm-plakietka:has-text("Mapowanie · Podzielność")').isVisible())
check('strona Kafelki 1/2', await page.locator('.tm-zakladka.wl:has-text("Kafelki · 1/2")').isVisible())
check('lista kafelków sektora (bez NWD)', (await page.locator('.tm-lista-poz').count()) === 3 && (await page.locator('.tm-lista:has-text("NWD")').count()) === 0)
check('źródło widoczne, ze wzorem', await page.locator('.tm-zrodlo-karta:has-text("dzieli") .katex').first().isVisible())
await page.click('.tm-zrodlo-strony button:has-text("Dowód")')
check('strona „Dowód" w źródle', await page.locator('.tm-zrodlo-karta:has-text("z definicji iloczynu")').isVisible())
check('ściąga schowana', (await page.locator('.sciaga-okno').count()) === 0)

// mapa kafelka
await page.click('.tm-kartka .tiptap')
await page.keyboard.type('Sens: m składa się z kawałków n. Granice: ?? zero')
await page.waitForTimeout(900)
let j = (await baza()).find((x) => x.id === 'ms')
check('mapa kafelka zapisuje się osobno', (j.mapyKafelkow?.mn0 ?? '').includes('kawałków') && !(j.mapa ?? '').includes('kawałków'))
check('luka „??" świeci w mapie', (await page.locator('.tm-kartka .luka-znak').count()) === 1)
check('lista pokazuje lukę przy kafelku', await page.locator('.tm-lista-poz:has-text("Podzielność") .tm-mini-luka').isVisible())

// ściąga: słowa użytkownika, klik wstawia nagłówek
await page.click('.tm-glowa .sciaga .tm-ikona')
check('ściąga po kliknięciu żarówki', await page.locator('.sciaga-okno:has-text("Przywołać Sens Treści")').isVisible())
check('ściąga ma punkty mapowania', await page.locator('.sciaga-okno:has-text("Konkretne Punkty (Przykład i Kontrprzykład)")').isVisible())
await page.screenshot({ path: `${zrzuty}/mapowanie-1-kafelek-sciaga.png` })
await page.click('.sciaga-punkt:has-text("Konkretne Punkty")')
await page.waitForTimeout(900)
j = (await baza()).find((x) => x.id === 'ms')
check('punkt ściągi wstawia nagłówek do mapy', /### Konkretne Punkty/.test(j.mapyKafelkow?.mn0 ?? ''), (j.mapyKafelkow?.mn0 ?? '').slice(-80))
await page.keyboard.press('Escape')

// zakrycie źródła
await page.click('.tm-zrodlo button:has-text("Zakryj, piszę z pamięci")')
check('zakrycie chowa źródło', (await page.locator('.tm-zrodlo-karta').count()) === 0 && (await page.locator('.tm-zrodlo-zakryte').isVisible()))
await page.click('.tm-zrodlo-zakryte button:has-text("Odsłoń")')

// pasek: wstaw sekcję
await page.click('.tm-kartka .tiptap')
await page.keyboard.press('Control+End')
await page.click('.tm-sekcje > button')
await page.click('.tm-sekcje-menu button:has-text("Połączenia i Mapa")')
await page.waitForTimeout(900)
j = (await baza()).find((x) => x.id === 'ms')
check('„Wstaw sekcję" dodaje podtytuł', /### Połączenia i Mapa/.test(j.mapyKafelkow?.mn0 ?? ''))

// następny kafelek
await page.click('.tm-nawigacja button:has-text("Dalej: Liczba pierwsza")')
check('przejście do drugiego kafelka', await page.locator('.tm-kartka-glowa:has-text("Liczba pierwsza")').isVisible())
check('druga mapa pusta (z podpowiedzią)', (await page.locator('.tm-kartka .rich-pusty').count()) === 1)

// podgląd ścieżki
await page.click('.tm-szyna-btn:has-text("Ścieżka")')
await page.waitForSelector('.tm-szuflada')
check('podgląd ścieżki: kafelki sektora „tu mapujesz"', (await page.locator('.tm-pp-karta.tu').count()) === 2)
check('podgląd ścieżki: kafelek spoza sektora', await page.locator('.tm-pp-karta:has-text("NWD")').isVisible())
await page.click('.tm-kartka .tiptap')
await page.locator('.tm-pp-karta:has-text("NWD") .tm-do-mapy').click()
await page.waitForTimeout(900)
j = (await baza()).find((x) => x.id === 'ms')
check('„↗ do mapy" wstawia odnośnik', (j.mapyKafelkow?.mn1 ?? '').includes('[[NWD]]'), j.mapyKafelkow?.mn1)
await page.click('.tm-zakladki button:has-text("Nauka")')
check('podgląd ścieżki w widoku Nauka: nagłówek sektora', await page.locator('.tm-pp-sektor:has-text("Podzielność")').isVisible())
await page.selectOption('.tm-pp-wybor', 'mp2')
check('podgląd innej ścieżki', !!(await page.waitForSelector('.tm-pp-karta:has-text("Granica ciągu")', { timeout: 5000 }).catch(() => null)))
await page.screenshot({ path: `${zrzuty}/mapowanie-2-podglad-sciezki.png` })
await page.click('.tm-szyna-btn:has-text("Biblioteka")')
await page.fill('.tm-szukaj input', 'granica')
check('biblioteka szuka po nazwie', (await page.locator('.tm-pp-karta').count()) === 1)
await page.click('.tm-pp-nazwa:has-text("Granica ciągu")')
check('biblioteka rozwija treść', !!(await page.waitForSelector('.tm-pp-pelna:has-text("prawie wszystkie")', { timeout: 5000 }).catch(() => null)))
await page.click('.tm-szyna-btn:has-text("Biblioteka")')
check('szuflada się zamyka', (await page.locator('.tm-szuflada').count()) === 0)

// całość sektora
await page.click('.tm-zakladka:has-text("Całość sektora")')
await page.waitForSelector('.tm-mapy-kafelkow')
check('całość: mapy kafelków z boku', (await page.locator('.tm-mk').count()) === 2 && (await page.locator('.tm-mk:has-text("kawałków")').count()) === 1)
await page.click('.tm-kartka .tiptap')
await page.keyboard.type('Podzielność → liczby pierwsze → NWD')
await page.waitForTimeout(900)
j = (await baza()).find((x) => x.id === 'ms')
check('mapa sektora zapisuje się w mapie sektora', (j.mapa ?? '').includes('liczby pierwsze'))
await page.screenshot({ path: `${zrzuty}/mapowanie-3-calosc.png` })

// przegląd
await page.click('.tm-zakladka:has-text("Przegląd")')
check('przegląd: tabela z lukami i stanem', (await page.locator('.tm-tabela-w').count()) === 3 && (await page.locator('.tm-luka-btn').count()) === 1)
check('przegląd: „Czy potrafię" ze słowami użytkownika', (await page.locator('.tm-czy-punkt').count()) === 6 && (await page.locator('.tm-czy:has-text("Wyjaśnić konsekwencje definicji")').isVisible()))
await page.screenshot({ path: `${zrzuty}/mapowanie-4-przeglad.png` })

// schowanie i powrót
await page.click('.tm-glowa button[aria-label="Schowaj tryb mapowania"]')
await page.waitForSelector('.tm', { state: 'detached' })
check('po schowaniu sektor dalej w mapowaniu', (await baza()).find((x) => x.id === 'ms').etap === 'mapowanie')
await page.click('.karta-sektora button:has-text("Mapuj")')
await page.waitForSelector('.tm')
check('„Mapuj" wraca do trybu, mapa została', await page.locator('.tm-kartka:has-text("kawałków")').isVisible())

// ciemny motyw
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
await page.waitForTimeout(200)
await page.screenshot({ path: `${zrzuty}/mapowanie-5-ciemny.png` })
await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))

// przerwanie: nic nie zaliczone, mapy zostają
await page.click('.tm-glowa button:has-text("Przerwij")')
await potwierdz(page)
await page.waitForSelector('.tm', { state: 'detached' })
j = (await baza()).find((x) => x.id === 'ms')
check('Przerwij: sektor wraca do „nowy", mapy zostają', j.etap === 'nowy' && (j.mapyKafelkow?.mn0 ?? '').includes('kawałków') && (j.mapa ?? '').includes('NWD'))

// zakładka Mapa w panelu: ściąga pod ikoną, przycisk trybu
await page.click('.panel-nauki-zakladki button:has-text("Mapa")')
check('zakładka Mapa: bez rozwiniętych list', (await page.locator('.mapa-sektora-pytania').count()) === 0 && (await page.locator('.mapa-sektora .sciaga .tm-ikona').isVisible()))
check('zakładka Mapa: przycisk trybu mapowania', await page.locator('.mapa-sektora button:has-text("Tryb mapowania")').isVisible())

// wąski ekran (telefon)
await page.setViewportSize({ width: 400, height: 800 })
await page.click('.mapa-sektora button:has-text("Tryb mapowania")').catch(() => {})
await page.waitForTimeout(400)
if (await page.locator('.tm').count()) {
  const szer = await page.evaluate(() => document.querySelector('.tm').scrollWidth)
  check('telefon: tryb mieści się w szerokości', szer <= 402, String(szer))
  await page.screenshot({ path: `${zrzuty}/mapowanie-6-telefon.png` })
}

console.log('\nBŁĘDY KONSOLI:', errors.length ? errors.join('\n') : 'brak')
await browser.close()
if (problems.length || errors.length) {
  console.log(`>>> NIEPOPRAWNE (${problems.length}): ${problems.join('; ')}`)
  process.exit(1)
}
console.log('>>> WSZYSTKO POPRAWNE')
